import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

interface JwtPayload {
  exp?: number;
  sub?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      jsonWebTokenOptions: {
        maxAge: configService.getOrThrow<string>('JWT_EXPIRATION'),
      },
    });
  }

  async validate(payload: JwtPayload) {
    if (
      !payload.sub ||
      (payload.exp !== undefined && payload.exp <= Date.now() / 1000)
    ) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null,
        status: 'ACTIVE',
      },
      omit: { password: true },
    });

    if (!user) throw new UnauthorizedException();
    return user;
  }
}
