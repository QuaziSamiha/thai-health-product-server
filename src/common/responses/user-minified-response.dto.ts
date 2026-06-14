import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { UserRole, UserStatus } from '../../generated/prisma/browser';

export interface MinifiedUser {
  id?: number;
  email?: string;
  status?: UserStatus;
  role?: UserRole;
  profile?: {
    name?: string | null;
  } | null;
}

export class UserMinifiedResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal user ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Full name from profile',
    example: 'Quazi Samiha',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'User email address',
    example: 'quazisamiha@gmail.com',
  })
  email!: string;

  @Expose()
  @ApiProperty({
    enum: UserRole,
    description: 'Assigned role',
    example: UserRole.ADMIN,
  })
  role!: UserRole;

  @Expose()
  @ApiProperty({
    enum: UserStatus,
    description: 'Current account status',
    example: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  constructor(user: MinifiedUser) {
    this.id = user.id!;
    this.name = user?.profile?.name ?? '';
    this.email = user.email ?? '';
    this.role = user.role!;
    this.status = user.status ?? UserStatus.ACTIVE;
  }
}
