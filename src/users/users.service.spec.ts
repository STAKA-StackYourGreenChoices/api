import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role, Status } from '../../generated/prisma';
import { AuthEmails } from '../mail/auth-emails';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { SortOrder, UserQueryDto, UserSortField } from './dto/user-query.dto';
import { UsersService } from './users.service';

const safeUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Example User',
  phone: null,
  role: Role.USER,
  status: Status.ACTIVE,
  profileBio: null,
  profileAvatarUrl: null,
  emailVerified: false,
  createdAt: new Date('2026-09-16T00:00:00.000Z'),
  updatedAt: new Date('2026-09-16T00:00:00.000Z'),
};

describe('UsersService (unit)', () => {
  let service: UsersService;

  const prisma = {
    user: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: unknown) => unknown) =>
      callback(prisma),
    ),
  };

  const authEmails = { sendVerification: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      prisma as PrismaService,
      authEmails as unknown as AuthEmails,
    );
  });

  describe('create', () => {
    const dto: CreateUserDto = {
      email: 'user@example.com',
      name: 'Example User',
      password: 'plaintext-password',
    };

    it('creates an active USER with a hashed password and verification token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(
        async (args: {
          data: {
            password: string;
            role: Role;
            status: Status;
            emailVerificationToken: string;
          };
        }) => {
          expect(args.data.password).not.toBe(dto.password);
          expect(args.data.password).toMatch(/^\$2[aby]\$/);
          await expect(
            bcrypt.compare(dto.password, args.data.password),
          ).resolves.toBe(true);
          expect(args.data.role).toBe(Role.USER);
          expect(args.data.status).toBe(Status.ACTIVE);
          expect(args.data.emailVerificationToken).toEqual(expect.any(String));
          return safeUser;
        },
      );

      await expect(service.create(dto)).resolves.toEqual(safeUser);
      const storedToken = (
        prisma.user.create.mock.calls[0][0] as {
          data: { emailVerificationToken: string };
        }
      ).data.emailVerificationToken;
      expect(authEmails.sendVerification).toHaveBeenCalledWith(
        safeUser.email,
        safeUser.name,
        storedToken,
      );
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.not.objectContaining({ password: true }),
        }),
      );
    });

    it('rejects duplicate email before hashing or writing', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate phone before writing', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-user' });

      await expect(
        service.create({ ...dto, phone: '+15551234567' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('retrieval', () => {
    it('finds a non-deleted user by id and returns the safe response shape', async () => {
      prisma.user.findFirst.mockResolvedValue(safeUser);

      await expect(service.findById('user-1')).resolves.toEqual(safeUser);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
        select: expect.objectContaining({
          email: true,
          role: true,
          status: true,
        }),
      });
      expect(safeUser).not.toHaveProperty('password');
      expect(safeUser).not.toHaveProperty('emailVerificationToken');
      expect(safeUser).not.toHaveProperty('passwordResetToken');
      expect(safeUser).not.toHaveProperty('passwordResetExpiry');
      expect(safeUser).not.toHaveProperty('deletedAt');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('applies filters, pagination, and allow-listed sorting', async () => {
      prisma.user.findMany.mockResolvedValue([safeUser]);
      const query = Object.assign(new UserQueryDto(), {
        page: 2,
        limit: 10,
        search: 'example',
        role: Role.USER,
        status: Status.ACTIVE,
        sortBy: UserSortField.EMAIL,
        sortOrder: SortOrder.ASC,
      });

      await expect(service.findAll(query)).resolves.toEqual([safeUser]);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            role: Role.USER,
            status: Status.ACTIVE,
          }),
          orderBy: { email: SortOrder.ASC },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('update', () => {
    it('strips role and status for non-admin updates', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue(safeUser);

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
        expect.objectContaining({ data: { name: 'Updated User' } }),
      );
    });

    it('rejects password updates through this method', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

      await expect(
        service.update('user-1', { password: 'new-password' }, false),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('marks the user inactive and revokes refresh tokens atomically', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.user.update.mockResolvedValue({
        ...safeUser,
        status: Status.INACTIVE,
      });

      await expect(service.softDelete('user-1')).resolves.toEqual({
        ...safeUser,
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
});
