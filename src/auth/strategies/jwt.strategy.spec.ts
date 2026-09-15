import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy (unit)', () => {
  let strategy: JwtStrategy;

  const prisma = {
    user: {
      findFirst: jest.fn(),
    },
  };

  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values = {
        JWT_SECRET: 'test-secret',
        JWT_EXPIRATION: '15m',
      };
      return values[key as keyof typeof values];
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('returns the current active user for a valid token payload', async () => {
    const user = { id: 'user-1', email: 'user@example.com', status: 'ACTIVE' };
    prisma.user.findFirst.mockResolvedValue(user);

    await expect(
      strategy.validate({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    ).resolves.toBe(user);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: user.id, deletedAt: null, status: 'ACTIVE' },
      omit: { password: true },
    });
  });

  it('rejects a deleted user', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'deleted-user' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it('rejects an inactive user', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'inactive-user' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('rejects an expired token payload before querying the database', async () => {
    await expect(
      strategy.validate({
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) - 1,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
