import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Status } from '../../generated/prisma';
import { UsersService } from './users.service';

describe('UsersService update and soft delete (unit)', () => {
  let service: UsersService;

  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof prisma) => unknown) =>
      callback(prisma),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(prisma as PrismaService);
  });

  it('strips role and status for non-admin updates', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({ id: 'user-1' });

    await service.update(
      'user-1',
      {
        name: 'Updated User',
        role: Role.ADMIN,
        status: Status.BLOCKED,
      },
      { role: Role.USER },
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Updated User' },
      }),
    );
  });

  it('allows role and status changes for admins', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({ id: 'user-1' });

    await service.update(
      'user-1',
      { role: Role.ADMIN, status: Status.ACTIVE },
      true,
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: Role.ADMIN, status: Status.ACTIVE },
      }),
    );
  });

  it('rejects password updates through this method', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

    await expect(
      service.update('user-1', { password: 'new-password' }, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an email already owned by another user', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });

    await expect(
      service.update('user-1', { email: 'taken@example.com' }, false),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('marks the user inactive and revokes refresh tokens atomically', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      status: Status.INACTIVE,
    });

    await expect(service.softDelete('user-1')).resolves.toEqual({
      id: 'user-1',
      status: Status.INACTIVE,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ status: Status.INACTIVE }),
      }),
    );
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects soft deletion of an unknown user', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.softDelete('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});
