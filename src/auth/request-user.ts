import { Role } from '../../generated/prisma';

/** The subset of the signed-in user (set by JwtStrategy) that handlers rely on. */
export interface RequestUser {
  id: string;
  role: Role;
}

export const isAdmin = (user: RequestUser) => user.role === Role.ADMIN;
