import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role, Status } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuthEmails } from '../mail/auth-emails';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const user = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Example User',
  phone: null,
  role: Role.USER,
  status: Status.ACTIVE,
  profileBio: null,
  profileAvatarUrl: null,
  emailVerified: false,
  createdAt: new Date('2026-09-17T00:00:00.000Z'),
  updatedAt: new Date('2026-09-17T00:00:00.000Z'),
};

describe('AuthService (unit)', () => {
  let service: AuthService;

  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: unknown) => unknown) =>
      callback(prisma),
    ),
  };
  const users = {
    create: jest.fn(),
    findById: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_REFRESH_EXPIRATION') return '7d';
      if (key === 'PASSWORD_RESET_EXPIRATION') return '1h';
      return undefined;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_EXPIRATION') return '15m';
      throw new Error(`Missing config: ${key}`);
    }),
  };
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('access-token'),
  };
  const authEmails = {
    sendPasswordReset: jest.fn(),
    sendVerification: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      config as unknown as ConfigService,
      jwt as unknown as JwtService,
      prisma as PrismaService,
      users as unknown as UsersService,
      authEmails as unknown as AuthEmails,
    );
  });

  describe('registration', () => {
    it('delegates registration to UsersService and issues tokens', async () => {
      users.create.mockResolvedValue(user);
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });

      await expect(
        service.register({
          email: user.email,
          name: user.name,
          password: 'Password123!',
        }),
      ).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: expect.any(String),
        user,
      });
      expect(users.create).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: user.id }),
        }),
      );
    });

    it('propagates duplicate registration conflicts', async () => {
      users.create.mockRejectedValue(
        new ConflictException('Email is already in use'),
      );

      await expect(
        service.register({
          email: user.email,
          name: user.name,
          password: 'Password123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const passwordHash = bcrypt.hashSync('Password123!', 10);

    it('logs in with valid credentials and persists a refresh token', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...user,
        password: passwordHash,
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });

      await expect(service.login(user.email, 'Password123!')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: expect.any(String),
        user,
      });
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('rejects an invalid password', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...user,
        password: passwordHash,
      });

      await expect(
        service.login(user.email, 'WrongPassword123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive user', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...user,
        status: Status.INACTIVE,
        password: passwordHash,
      });

      await expect(
        service.login(user.email, 'Password123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a blocked user', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...user,
        status: Status.BLOCKED,
        password: passwordHash,
      });

      await expect(
        service.login(user.email, 'Password123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a deleted user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login(user.email, 'Password123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: user.email, deletedAt: null },
        }),
      );
    });
  });

  describe('refresh and logout', () => {
    const current = {
      deletedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      token: 'old-refresh-token',
      user: {
        ...user,
        deletedAt: null,
      },
    };

    it('rotates the refresh token inside a transaction', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(current);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'replacement' });

      await expect(service.refresh('old-refresh-token')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: expect.any(String),
        user,
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'old-refresh-token' },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: user.id }),
        }),
      );
    });

    it('logs out by deleting the supplied refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.logout('refresh-token')).resolves.toEqual({
        success: true,
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'refresh-token' },
      });
    });
  });

  describe('password management', () => {
    it('changes the password and revokes all refresh tokens', async () => {
      const currentPassword = 'CurrentPassword123!';
      prisma.user.findFirst.mockResolvedValue({
        password: await bcrypt.hash(currentPassword, 10),
      });

      const dto: ChangePasswordDto = {
        currentPassword,
        newPassword: 'NewPassword123!',
      };
      await expect(service.changePassword(user.id, dto)).resolves.toEqual({
        success: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({ password: expect.any(String) }),
        }),
      );
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: user.id },
      });
    });

    it('stores a reset token and emails it without returning it', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: user.id,
        email: user.email,
        name: user.name,
      });
      prisma.user.update.mockResolvedValue(user);

      const result = await service.forgotPassword(user.email);

      expect(result).toEqual({
        message:
          'If an account exists for that email, we have sent a password reset link',
      });
      expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{64}/);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: {
            passwordResetToken: expect.any(String),
            passwordResetExpiry: expect.any(Date),
          },
        }),
      );
      const storedToken = (
        prisma.user.update.mock.calls[0][0] as {
          data: { passwordResetToken: string };
        }
      ).data.passwordResetToken;
      expect(authEmails.sendPasswordReset).toHaveBeenCalledWith(
        user.email,
        user.name,
        storedToken,
        expect.any(Date),
      );
    });

    it('answers an unknown email exactly like a known one and sends nothing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.forgotPassword('nobody@example.com'),
      ).resolves.toEqual({
        message:
          'If an account exists for that email, we have sent a password reset link',
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(authEmails.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('resets the password, clears reset fields, and revokes tokens', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: user.id });
      prisma.user.update.mockResolvedValue(user);

      const dto: ResetPasswordDto = {
        token: 'reset-token',
        newPassword: 'ResetPassword123!',
      };
      await expect(service.resetPassword(dto)).resolves.toEqual({
        success: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password: expect.any(String),
            passwordResetToken: null,
            passwordResetExpiry: null,
          }),
        }),
      );
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: user.id },
      });
    });
  });

  describe('email verification', () => {
    it('marks the user verified and clears the token', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.verifyEmail({ token: 'verification-token' }),
      ).resolves.toEqual({ success: true });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          emailVerificationToken: 'verification-token',
        }),
        data: {
          emailVerified: true,
          emailVerificationToken: null,
        },
      });
    });
  });
});
