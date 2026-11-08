import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role, Status } from '../../generated/prisma';
import { AuthEmails } from '../mail/auth-emails';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  status: Status;
  profileBio: string | null;
  profileAvatarUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  profileBio: true,
  profileAvatarUrl: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly authEmails: AuthEmails,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.users.create(dto);
    return this.issueTokens(user);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { ...safeUserSelect, password: true },
    });

    if (
      !user ||
      user.status !== Status.ACTIVE ||
      !(await bcrypt.compare(password, user.password))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password: ignoredPassword, ...safeUser } = user;
    void ignoredPassword;
    return this.issueTokens(safeUser);
  }

  async refresh(refreshToken: string) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshToken.findUnique({
        where: { token: refreshToken },
        select: {
          token: true,
          expiresAt: true,
          user: {
            select: {
              ...safeUserSelect,
              deletedAt: true,
            },
          },
        },
      });

      if (
        !current ||
        current.expiresAt <= new Date() ||
        current.user.deletedAt !== null ||
        current.user.status !== Status.ACTIVE
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const deleted = await transaction.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
      if (deleted.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const accessToken = await this.issueAccessToken(current.user);
      const replacementToken = randomBytes(48).toString('hex');
      await transaction.refreshToken.create({
        data: {
          token: replacementToken,
          userId: current.user.id,
          expiresAt: new Date(Date.now() + this.getRefreshLifetime()),
        },
      });

      const { deletedAt, ...user } = current.user;
      void deletedAt;
      return { accessToken, refreshToken: replacementToken, user };
    });
  }

  async logout(refreshToken: string) {
    const current = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      select: { expiresAt: true },
    });

    if (!current || current.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const deleted = await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
    if (deleted.count !== 1) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: Status.ACTIVE },
      select: { password: true },
    });

    if (!user || !(await bcrypt.compare(dto.currentPassword, user.password))) {
      throw new UnauthorizedException('Current password is invalid');
    }

    const password = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { password },
      });
      await transaction.refreshToken.deleteMany({ where: { userId } });
    });

    return { success: true };
  }

  /**
   * Always answers with the same message, whether or not the email belongs to
   * an account, so the endpoint can't be used to discover who has signed up.
   * The token only ever leaves the server by email.
   */
  async forgotPassword(email: string) {
    const response = {
      message:
        'If an account exists for that email, we have sent a password reset link',
    };

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, status: Status.ACTIVE },
      select: { id: true, email: true, name: true },
    });
    if (!user) return response;

    const resetToken = randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + this.getPasswordResetLifetime());
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiry: resetExpiry,
      },
    });
    await this.authEmails.sendPasswordReset(
      user.email,
      user.name,
      resetToken,
      resetExpiry,
    );

    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpiry: { gt: new Date() },
        deletedAt: null,
        status: Status.ACTIVE,
      },
      select: { id: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const password = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          password,
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      });
      await transaction.refreshToken.deleteMany({ where: { userId: user.id } });
    });

    return { success: true };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const result = await this.prisma.user.updateMany({
      where: {
        emailVerificationToken: dto.token,
        deletedAt: null,
        status: Status.ACTIVE,
      },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
      },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException('Invalid email verification token');
    }

    return { success: true };
  }

  /** Issues a fresh verification link for a signed-in user who lost the first one. */
  async resendVerification(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { email: true, name: true, emailVerified: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.emailVerified) return { message: 'Email is already verified' };

    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerificationToken: token },
    });
    await this.authEmails.sendVerification(user.email, user.name, token);
    return { message: 'Verification email sent' };
  }

  getCurrentUser(userId: string) {
    return this.users.findById(userId);
  }

  private async issueTokens(user: AuthenticatedUser) {
    const accessToken = await this.issueAccessToken(user);
    const refreshToken = randomBytes(48).toString('hex');
    const refreshLifetime = this.getRefreshLifetime();

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + refreshLifetime),
      },
    });

    return { accessToken, refreshToken, user };
  }

  private issueAccessToken(
    user: Pick<AuthenticatedUser, 'id' | 'email' | 'role'>,
  ) {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private getRefreshLifetime() {
    const value =
      this.config.get<string>('JWT_REFRESH_EXPIRATION') ??
      this.config.getOrThrow<string>('JWT_EXPIRATION');
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);

    if (!match) {
      throw new Error(
        'JWT_REFRESH_EXPIRATION must be a duration such as 15m, 7d, or 3600s',
      );
    }

    const amount = Number(match[1]);
    const multipliers = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    } as const;
    return amount * multipliers[match[2] as keyof typeof multipliers];
  }

  private getPasswordResetLifetime() {
    const value = this.config.get<string>('PASSWORD_RESET_EXPIRATION') ?? '1h';
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);

    if (!match) {
      throw new Error(
        'PASSWORD_RESET_EXPIRATION must be a duration such as 1h or 30m',
      );
    }

    const amount = Number(match[1]);
    const multipliers = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    } as const;
    return amount * multipliers[match[2] as keyof typeof multipliers];
  }
}
