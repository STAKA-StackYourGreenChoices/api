import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role, Status } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type UpdateUserPayload = UpdateUserDto & {
  password?: unknown;
  role?: Role;
  status?: Status;
};

type ActingUser = boolean | { role?: Role };

@Injectable()
export class UsersService {
  private static readonly PASSWORD_ROUNDS = 10;

  private static readonly safeUserSelect = {
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

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const duplicateEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (duplicateEmail) {
      throw new ConflictException('Email is already in use');
    }

    if (dto.phone) {
      const duplicatePhone = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
        select: { id: true },
      });
      if (duplicatePhone) {
        throw new ConflictException('Phone is already in use');
      }
    }

    const password = await bcrypt.hash(
      dto.password,
      UsersService.PASSWORD_ROUNDS,
    );

    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          phone: dto.phone,
          password,
          role: Role.USER,
          status: Status.ACTIVE,
          profileBio: dto.profileBio,
          profileAvatarUrl: dto.profileAvatarUrl,
          emailVerificationToken: randomBytes(32).toString('hex'),
        },
        select: UsersService.safeUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email or phone is already in use');
      }
      throw error;
    }
  }

  async findAll(query: UserQueryDto = new UserQueryDto()) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [query.sortBy]: query.sortOrder,
    };

    return this.prisma.user.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: UsersService.safeUserSelect,
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: UsersService.safeUserSelect,
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserPayload, actingUser: ActingUser) {
    const existingUser = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existingUser) throw new NotFoundException(`User ${id} not found`);

    if (Object.prototype.hasOwnProperty.call(dto, 'password')) {
      throw new BadRequestException(
        'Password changes must use the password management flow',
      );
    }

    if (dto.email !== undefined) {
      const duplicateEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (duplicateEmail && duplicateEmail.id !== id) {
        throw new ConflictException('Email is already in use');
      }
    }

    if (dto.phone !== undefined) {
      const duplicatePhone = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
        select: { id: true },
      });
      if (duplicatePhone && duplicatePhone.id !== id) {
        throw new ConflictException('Phone is already in use');
      }
    }

    const isAdmin =
      typeof actingUser === 'boolean'
        ? actingUser
        : actingUser.role === Role.ADMIN;
    const data: Prisma.UserUpdateInput = {};

    if (dto.email !== undefined) data.email = dto.email;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.profileBio !== undefined) data.profileBio = dto.profileBio;
    if (dto.profileAvatarUrl !== undefined) {
      data.profileAvatarUrl = dto.profileAvatarUrl;
    }
    if (isAdmin && dto.role !== undefined) data.role = dto.role;
    if (isAdmin && dto.status !== undefined) data.status = dto.status;

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: UsersService.safeUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email or phone is already in use');
      }
      throw error;
    }
  }

  async softDelete(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existingUser) throw new NotFoundException(`User ${id} not found`);

      const user = await transaction.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: Status.INACTIVE },
        select: UsersService.safeUserSelect,
      });

      await transaction.refreshToken.deleteMany({ where: { userId: id } });
      return user;
    });
  }
}
