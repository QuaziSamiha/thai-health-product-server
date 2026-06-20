import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { ProfileRepository } from './repositories/profile.repository';
import { UserSecurityRepository } from './repositories/user-security.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import {
  UserResponseDto,
  UserResponseDtoWithDetails,
} from './dto/user-response.dto';
import { getBaseUrl } from '../../common/utils/env.util';
import { HashService } from '../../shared/hash/hash.service';
import { OtpService } from '../otp/otp.service';
import {
  AuthProvider,
  OTPType,
  UserStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { UserSecurityMeResponseDto } from './dto/user-security-response.dto';
import { PaginationQueryDto, IPaginatedResult } from '../../shared/pagination';
@Injectable()
export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly securityRepo: UserSecurityRepository,
    @Inject(forwardRef(() => OtpService))
    private readonly otpService: OtpService,
    private readonly hashService: HashService,
  ) {}

  async registerUser(
    dto: CreateUserDto,
    ipAddress: string,
  ): Promise<UserResponseDtoWithDetails> {
    const { profile, security, ...userData } = dto;
    const isEmailAuth =
      !userData.authProvider || userData.authProvider === AuthProvider.EMAIL;

    // * RULE 1: Guard against manual Provider ID injection -- If no authProvider is specified (defaults to EMAIL), they cannot provide an external ID
    if (isEmailAuth && userData.providerId) {
      throw new BadRequestException(
        'Provider ID is not allowed for Email registration',
      );
    }

    // * RULE 2: Password logic -- If it's an EMAIL signup, password is required.
    if (isEmailAuth && !userData.password) {
      throw new BadRequestException(
        'Password is required for Email registration',
      );
    }

    // * RULE 3: Check if user exists
    const existing = await this.userRepo.findUserByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = userData.password
      ? await this.hashService.hash(userData.password)
      : undefined;

    // * RULE 4: Execute Transaction
    return await this.userRepo.withTransaction(async (tx) => {
      // * Create User
      const user = await this.userRepo.createUser(
        {
          ...userData,
          password: hashedPassword,
          status: isEmailAuth
            ? UserStatus.PENDING_VERIFICATION
            : UserStatus.ACTIVE,
        },
        tx,
      );

      // * Create Profile
      await this.profileRepo.createUserProfile(
        {
          ...profile,
          userId: user.id,
          name:
            profile.name ||
            `${profile.firstName} ${profile.lastName || ''}`.trim(),
          dateOfBirth: profile.dateOfBirth
            ? new Date(profile.dateOfBirth)
            : undefined,
        },
        tx,
      );

      // * Create Security record
      await this.securityRepo.createUserSecurity(
        {
          userId: user.id,
          isEmailVerified: !isEmailAuth,
          emailVerifiedAt: !isEmailAuth ? new Date() : null,
          lastLoginIp: ipAddress,
          assignedIp: security?.assignedIp ?? undefined,
        },
        tx,
      );

      // * Create and Send OTP
      await this.otpService.generateAndSendOtp(
        user.email,
        OTPType.SIGNUP,
        user.id,
        tx,
      );

      const fullUser = await this.userRepo.findUserByEmailWithDetails(
        user.email,
        tx,
      );

      if (!fullUser) {
        throw new ConflictException(
          'Failed to retrieve user after registration',
        );
      }

      return new UserResponseDtoWithDetails(fullUser, getBaseUrl());
    });
  }

  async getUserByEmail(email: string) {
    const existingUser = await this.userRepo.findUserByEmail(email);

    if (!existingUser) {
      throw new NotFoundException(`User with email ${email} not found.`);
    }

    return new UserResponseDto(existingUser);
  }

  async getMyProfile(id: number): Promise<UserResponseDtoWithDetails> {
    const existingUser = await this.userRepo.findUserById(id);

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    return new UserResponseDtoWithDetails(existingUser, getBaseUrl());
  }

  async getAllUsers(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<UserResponseDtoWithDetails>> {
    const paginatedUsers = await this.userRepo.findAllUsers(params);

    return {
      ...paginatedUsers,
      data: paginatedUsers.data.map(
        (user) => new UserResponseDtoWithDetails(user, getBaseUrl()),
      ),
    };
  }

  async getUserById(id: number) {
    const existingUser = await this.userRepo.findUserById(id);

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    return new UserResponseDto(existingUser);
  }

  async activateUser(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<UserResponseDtoWithDetails> {
    // * Update User Status to ACTIVE
    await this.userRepo.updateUserStatusById(userId, UserStatus.ACTIVE, tx);

    // 2. Mark Email as Verified in Security Record
    await this.securityRepo.updateEmailVerification(userId, true, tx);

    const user = await this.userRepo.findUserById(userId, tx);
    if (!user) {
      throw new ConflictException('Failed to retrieve user after registration');
    }

    return new UserResponseDtoWithDetails(user, getBaseUrl());
  }

  async updateUserRole(
    userId: number,
    role: UserRole,
  ): Promise<UserResponseDtoWithDetails> {
    const existingUser = await this.userRepo.findUserById(userId);

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    const updatedUser = await this.userRepo.updateUserRole(userId, role);
    return new UserResponseDtoWithDetails(updatedUser, getBaseUrl());
  }

  async updatePassword(
    userId: number,
    dto: UpdatePasswordDto,
  ): Promise<UserResponseDtoWithDetails> {
    const user = await this.userRepo.findUserByIdWithPassword(userId, true);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    if (!user.password) {
      throw new BadRequestException(
        'User does not have a password set. You may have registered using a social login.',
      );
    }

    const isMatch = await this.hashService.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isMatch) {
      throw new BadRequestException('Current password does not match.');
    }

    const hashedNewPassword = await this.hashService.hash(dto.newPassword);
    const updatedUser = await this.userRepo.updatePassword(
      userId,
      hashedNewPassword,
    );

    return new UserResponseDtoWithDetails(updatedUser, getBaseUrl());
  }

  async findForAuth(email: string) {
    const user = await this.userRepo.findUserByEmailWithPassword(email, true);

    return user;
  }

  async updateLoginAttempts(userId: number, tx?: Prisma.TransactionClient) {
    const result = await this.securityRepo.incrementLoginAttempts(userId, tx);
    if (!result.userId) {
      throw new NotFoundException('User not found to update login attempts');
    }
    return new UserSecurityMeResponseDto(result);
  }

  async updateLoginSuccess(
    userId: number,
    ip?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const result = await this.securityRepo.updateLoginMetadata(userId, ip, tx);
    if (!result.userId) {
      throw new NotFoundException('User not found to update login time');
    }
    return result;
  }

  async updateLastLoginTime(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<UserResponseDto> {
    const user = await this.userRepo.updateLastLoginTime(userId, tx);
    if (!user) {
      throw new NotFoundException('User not found to update login time');
    }
    return new UserResponseDto(user);
  }
}
