import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../generated/prisma';
import { RolesGuard } from './roles.guard';

describe('RolesGuard (unit)', () => {
  let guard: RolesGuard;
  let requiredRoles: Role[] | undefined;

  const reflector = {
    getAllAndOverride: jest.fn(() => requiredRoles),
  };

  const context = (user?: { role?: Role }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    requiredRoles = undefined;
    jest.clearAllMocks();
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows routes without role metadata', () => {
    expect(guard.canActivate(context())).toBe(true);
  });

  it('allows a user with a required role', () => {
    requiredRoles = [Role.ADMIN];

    expect(guard.canActivate(context({ role: Role.ADMIN }))).toBe(true);
  });

  it('denies a user without a required role', () => {
    requiredRoles = [Role.ADMIN];

    expect(guard.canActivate(context({ role: Role.USER }))).toBe(false);
  });
});
