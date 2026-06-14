import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaseRepository } from '../../../prisma/base.repository';
import { Prisma, UserStatus } from '../../../generated/prisma/client';
import { UserRole } from '../../../generated/prisma/enums';
import { PaginationService } from '../../../shared/pagination/pagination.service';
import { PaginationParamsDto } from '../../../shared/pagination/dto/pagination-params.dto';

@Injectable()
export class UserRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  private readonly PROFILE_SELECT = {
    firstName: true,
    lastName: true,
    name: true,
    avatarUrl: true,
    bio: true,
    dateOfBirth: true,
    gender: true,
    metadata: true,
  } as const;

  private readonly SECURITY_SELECT_CUSTOMER = {
    isEmailVerified: true,
    emailVerifiedAt: true,
  } as const;

  private readonly SECURITY_SELECT_ADMIN = {
    isEmailVerified: true,
    emailVerifiedAt: true,
    loginAttempts: true,
    lastLoginIp: true,
    assignedIp: true,
  } as const;

  private readonly FULL_USER_SELECT_CUSTOMER = {
    id: true,
    sid: true,
    email: true,
    phone: true,
    role: true,
    status: true,
    authProvider: true,
    providerId: true,
    profile: { select: this.PROFILE_SELECT },
    security: { select: this.SECURITY_SELECT_CUSTOMER },
    createdAt: true,
    updatedAt: true,
    lastLoginAt: true,
  } as const;

  private readonly FULL_USER_SELECT_ADMIN = {
    id: true,
    sid: true,
    email: true,
    phone: true,
    role: true,
    status: true,
    authProvider: true,
    providerId: true,
    profile: { select: this.PROFILE_SELECT },
    security: { select: this.SECURITY_SELECT_ADMIN },
    createdAt: true,
    updatedAt: true,
    lastLoginAt: true,
  } as const;

  private readonly USER_SELECT = {
    id: true,
    sid: true,
    email: true,
    phone: true,
    role: true,
    status: true,
    authProvider: true,
    providerId: true,
    createdAt: true,
    updatedAt: true,
    lastLoginAt: true,
  } as const;

  async createUser(
    data: Prisma.UserCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.user.create({ data, select: this.USER_SELECT });
  }

  async findUserByEmailWithDetails(
    email: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.user.findUnique({
      where: { email },
      select: this.FULL_USER_SELECT_CUSTOMER,
    });
  }

  async findUserByEmail(email: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.user.findUnique({
      where: { email },
      select: this.USER_SELECT,
    });
  }

  async findUserByEmailWithPassword(
    email: string,
    includePassword = false,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.user.findUnique({
      where: { email },
      select: {
        ...this.USER_SELECT,
        password: includePassword, // * Needed for bcrypt compare
      },
    });
  }

  async findUserByIdWithPassword(
    id: number,
    includePassword = false,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.user.findUnique({
      where: { id },
      select: {
        ...this.USER_SELECT,
        password: includePassword,
      },
    });
  }

  async findUserById(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.user.findUnique({
      where: { id: userId },
      select: this.FULL_USER_SELECT_CUSTOMER,
    });
  }

  async updateUserStatusById(
    userId: number,
    status: UserStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    return await client.user.update({
      where: { id: userId },
      data: { status },
      select: this.USER_SELECT,
    });
  }

  async updateUserRole(
    userId: number,
    role: UserRole,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    return await client.user.update({
      where: { id: userId },
      data: { role },
      select: this.FULL_USER_SELECT_ADMIN,
    });
  }

  async updatePassword(
    id: number,
    hashedPassword: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    return await client.user.update({
      where: { id },
      data: { password: hashedPassword },
      select: this.FULL_USER_SELECT_CUSTOMER,
    });
  }

  async updateLastLoginTime(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async findAllUsers(
    params: PaginationParamsDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate(client.user, params, {
      select: this.FULL_USER_SELECT_ADMIN,
      searchableFields: ['email', 'profile.name'],
      defaultSortField: 'createdAt',
    });
  }
}

// async findByEmailWithAuth(email: string, includeAuth = false) {
//   return this.prisma.user.findUnique({
//     where: { email },
//     select: {
//       ...this.USER_SELECT,
//       password: includeAuth, // * Needed for bcrypt compare
//       security: includeAuth
//         ? {
//             select: {
//               loginAttempts: includeAuth,
//               isEmailVerified: includeAuth,
//             },
//           }
//         : false,
//     },
//   });
// }
