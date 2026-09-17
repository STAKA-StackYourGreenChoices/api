import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Status } from '../generated/prisma';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const userDto = (email: string, phone?: string) => ({
  email,
  name: 'Integration User',
  phone,
  password: 'Password123!',
});

describe('Users (integration, real postgres)', () => {
  let prisma: PrismaService;
  let users: UsersService;

  beforeAll(async () => {
    await startTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    await prisma.$connect();
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  afterEach(async () => {
    await prisma.truncateAll();
  });

  it('persists a user with a hashed password', async () => {
    const created = await users.create(
      userDto('persist@example.com', '+15550000001'),
    );
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(stored.email).toBe('persist@example.com');
    expect(stored.password).not.toBe('Password123!');
    await expect(bcrypt.compare('Password123!', stored.password)).resolves.toBe(
      true,
    );
  });

  it('enforces unique email and phone constraints', async () => {
    await users.create(userDto('unique@example.com', '+15550000002'));

    await expect(
      users.create(userDto('unique@example.com', '+15550000003')),
    ).rejects.toThrow();
    await expect(
      users.create(userDto('other@example.com', '+15550000002')),
    ).rejects.toThrow();
  });

  it('soft deletes a user without removing the database row', async () => {
    const created = await users.create(userDto('soft-delete@example.com'));

    await users.softDelete(created.id);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.deletedAt).toEqual(expect.any(Date));
    expect(stored.status).toBe(Status.INACTIVE);
    await expect(users.findById(created.id)).rejects.toThrow();
  });

  it('persists refresh tokens for a user', async () => {
    const created = await users.create(userDto('refresh@example.com'));
    const token = await prisma.refreshToken.create({
      data: {
        token: 'integration-refresh-token',
        userId: created.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect(token.userId).toBe(created.id);
    await expect(
      prisma.refreshToken.findUnique({
        where: { token: 'integration-refresh-token' },
      }),
    ).resolves.toEqual(expect.objectContaining({ userId: created.id }));
  });

  it('cascades refresh-token deletion on hard user deletion', async () => {
    const created = await users.create(userDto('cascade@example.com'));
    await prisma.refreshToken.create({
      data: {
        token: 'cascade-refresh-token',
        userId: created.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await prisma.user.delete({ where: { id: created.id } });

    await expect(
      prisma.refreshToken.findUnique({
        where: { token: 'cascade-refresh-token' },
      }),
    ).resolves.toBeNull();
  });
});
