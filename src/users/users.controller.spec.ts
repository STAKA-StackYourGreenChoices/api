import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../generated/prisma';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController (unit)', () => {
  let controller: UsersController;

  const users = {
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(users as unknown as UsersService);
  });

  it('delegates user listing to the service', () => {
    const query = new UserQueryDto();
    users.findAll.mockReturnValue([]);

    expect(controller.findAll(query)).toEqual([]);
    expect(users.findAll).toHaveBeenCalledWith(query);
  });

  it('allows a user to access their own record', () => {
    users.findById.mockReturnValue({ id: 'user-1' });

    expect(
      controller.findById('user-1', { id: 'user-1', role: Role.USER }),
    ).toEqual({ id: 'user-1' });
  });

  it('allows an admin to access another user record', () => {
    users.findById.mockReturnValue({ id: 'user-2' });

    expect(
      controller.findById('user-2', { id: 'admin-1', role: Role.ADMIN }),
    ).toEqual({ id: 'user-2' });
  });

  it('rejects a non-admin accessing another user record', () => {
    expect(() =>
      controller.findById('user-2', { id: 'user-1', role: Role.USER }),
    ).toThrow(ForbiddenException);
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('forwards the authenticated user when updating their own record', () => {
    const dto = { name: 'Updated' } as UpdateUserDto;
    const currentUser = { id: 'user-1', role: Role.USER };
    users.update.mockReturnValue({ id: 'user-1' });

    expect(controller.update('user-1', dto, currentUser)).toEqual({
      id: 'user-1',
    });
    expect(users.update).toHaveBeenCalledWith('user-1', dto, currentUser);
  });

  it('rejects a non-admin updating another user record', () => {
    expect(() =>
      controller.update(
        'user-2',
        { name: 'Updated' },
        { id: 'user-1', role: Role.USER },
      ),
    ).toThrow(ForbiddenException);
    expect(users.update).not.toHaveBeenCalled();
  });

  it('delegates admin deletion to the service', () => {
    users.softDelete.mockReturnValue({ id: 'user-2' });

    expect(controller.softDelete('user-2')).toEqual({ id: 'user-2' });
    expect(users.softDelete).toHaveBeenCalledWith('user-2');
  });
});
