import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRepository } from './repositories/user.repository';
import { ProfileRepository } from './repositories/profile.repository';
import { UserSecurityRepository } from './repositories/user-security.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  UserResponseDto,
  UserResponseDtoWithDetails,
} from './dto/user-response.dto';
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
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly securityRepo: UserSecurityRepository,
    @Inject(forwardRef(() => OtpService))
    private readonly otpService: OtpService,
    private readonly hashService: HashService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
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

      return new UserResponseDtoWithDetails(
        fullUser,
        this.configService.get<string>('app.baseUrl'),
      );
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

    return new UserResponseDtoWithDetails(
      existingUser,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  async getAllUsers(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<UserResponseDtoWithDetails>> {
    const paginatedUsers = await this.userRepo.findAllUsers(params);

    return {
      ...paginatedUsers,
      data: paginatedUsers.data.map(
        (user) =>
          new UserResponseDtoWithDetails(
            user,
            this.configService.get<string>('app.baseUrl'),
          ),
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

    return new UserResponseDtoWithDetails(
      user,
      this.configService.get<string>('app.baseUrl'),
    );
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
    return new UserResponseDtoWithDetails(
      updatedUser,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  async deactivateUser(userId: number): Promise<UserResponseDtoWithDetails> {
    const existingUser = await this.userRepo.findUserById(userId);

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    if (existingUser.status === UserStatus.DEACTIVATED) {
      throw new ConflictException('User is already deactivated.');
    }

    await this.userRepo.updateUserStatusById(userId, UserStatus.DEACTIVATED);

    const updatedUser = await this.userRepo.findUserById(userId);
    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    return new UserResponseDtoWithDetails(
      updatedUser,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
    avatarFile?: Express.Multer.File,
  ): Promise<UserResponseDtoWithDetails> {
    const existingUser = await this.userRepo.findUserById(userId);
    if (!existingUser) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    const profileUpdateData: Prisma.ProfileUpdateInput = {};

    if (dto.firstName !== undefined) {
      profileUpdateData.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      profileUpdateData.lastName = dto.lastName;
    }
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const firstName = dto.firstName ?? existingUser.profile?.firstName ?? '';
      const lastName = dto.lastName ?? existingUser.profile?.lastName ?? '';
      profileUpdateData.name = `${firstName} ${lastName}`.trim();
    }

    // * UPLOAD BEFORE THE DB WRITE SO A FAILED UPLOAD NEVER LEAVES A DANGLING
    // * avatarUrl; THE OLD FILE IS ONLY DELETED AFTER THE NEW ONE IS COMMITTED.
    let oldAvatarFilename: string | undefined;
    if (avatarFile) {
      const savedFile = await this.storageService.saveFile(
        avatarFile,
        'profiles',
      );
      profileUpdateData.avatarUrl = savedFile.path;
      if (existingUser.profile?.avatarUrl) {
        oldAvatarFilename = existingUser.profile.avatarUrl.split('/').pop();
      }
    } else if (dto.removeAvatar && existingUser.profile?.avatarUrl) {
      profileUpdateData.avatarUrl = null;
      oldAvatarFilename = existingUser.profile.avatarUrl.split('/').pop();
    }

    await this.userRepo.withTransaction(async (tx) => {
      if (Object.keys(profileUpdateData).length > 0) {
        await this.profileRepo.updateProfile(userId, profileUpdateData, tx);
      }
      if (dto.phone !== undefined) {
        await this.userRepo.updateUserPhone(userId, dto.phone, tx);
      }
    });

    if (oldAvatarFilename) {
      await this.storageService
        .deleteFile(oldAvatarFilename, 'profiles')
        .catch((e) =>
          this.logger.warn(`Could not delete old avatar file: ${e}`),
        );
    }

    const updatedUser = await this.userRepo.findUserById(userId);
    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    return new UserResponseDtoWithDetails(
      updatedUser,
      this.configService.get<string>('app.baseUrl'),
    );
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

    const isSameAsCurrent = await this.hashService.compare(
      dto.newPassword,
      user.password,
    );
    if (isSameAsCurrent) {
      throw new BadRequestException(
        'New password must be different from the current password.',
      );
    }

    const hashedNewPassword = await this.hashService.hash(dto.newPassword);
    const updatedUser = await this.userRepo.updatePassword(
      userId,
      hashedNewPassword,
    );

    return new UserResponseDtoWithDetails(
      updatedUser,
      this.configService.get<string>('app.baseUrl'),
    );
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
