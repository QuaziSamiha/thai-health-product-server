import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryManRepository } from './repositories/delivery-man.repository';
import { UserService } from '../user/user.service';
import { CreateDeliveryManDto } from './dto/create-delivery-man.dto';
import { UpdateDeliveryManDto } from './dto/update-delivery-man.dto';
import { DeliveryManResponseDto } from './dto/delivery-man-response.dto';
import {
  NidVerificationStatus,
  Prisma,
  UserRole,
} from '../../generated/prisma/client';
import { PaginationQueryDto, IPaginatedResult } from '../../shared/pagination';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';

const NID_FOLDER = 'delivery-man/nid';
const AVATAR_FOLDER = 'profiles';

@Injectable()
export class DeliveryManService {
  private readonly logger = new Logger(DeliveryManService.name);

  constructor(
    private readonly deliveryManRepo: DeliveryManRepository,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
  ) {}

  private toResponseDto(row: NonNullable<Awaited<ReturnType<DeliveryManRepository['findByUserId']>>>) {
    return new DeliveryManResponseDto(
      row,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  //* NO PASSWORD, NO OTP: THIS IS AN ADMIN-MANAGED DIRECTORY, NOT SELF-SERVICE
  //* SIGNUP — SEE docs/delivery-man.md "Open Questions" #1. status IS ACTIVE
  //* IMMEDIATELY SINCE THERE'S NO EMAIL-VERIFICATION STEP TO WAIT ON.
  async createDeliveryMan(
    dto: CreateDeliveryManDto,
    avatarFile?: Express.Multer.File,
    nidDocumentFile?: Express.Multer.File,
  ): Promise<DeliveryManResponseDto> {
    if (await this.userService.emailExists(dto.email)) {
      throw new ConflictException('Email already registered');
    }

    let avatarUrl: string | undefined;
    let nidDocumentUrl: string | undefined;

    try {
      if (avatarFile) {
        const saved = await this.storageService.saveFile(
          avatarFile,
          AVATAR_FOLDER,
        );
        avatarUrl = saved.path;
      }
      if (nidDocumentFile) {
        const saved = await this.storageService.saveFile(
          nidDocumentFile,
          NID_FOLDER,
        );
        nidDocumentUrl = saved.path;
      }

      const userId = await this.userService.createManagedUser(
        {
          email: dto.email,
          phone: dto.phone,
          role: UserRole.DELIVERY_PARTNER,
          firstName: dto.firstName,
          lastName: dto.lastName,
          avatarUrl,
        },
        async (createdUserId, tx) => {
          await this.deliveryManRepo.createDeliveryManProfile(
            {
              userId: createdUserId,
              nidNumber: dto.nidNumber,
              nidDocumentUrl,
              vehicleType: dto.vehicleType,
              vehicleRegistrationNo: dto.vehicleRegistrationNo,
              drivingLicenseNo: dto.drivingLicenseNo,
              coverageArea: dto.coverageArea,
              employmentType: dto.employmentType,
              joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : undefined,
            },
            tx,
          );
        },
      );

      const created = await this.deliveryManRepo.findByUserId(userId);
      if (!created) {
        throw new NotFoundException('Delivery man not found after creation');
      }
      return this.toResponseDto(created);
    } catch (error) {
      // * ROLLBACK UPLOADED FILES ON ANY FAILURE — SAME "UPLOAD BEFORE WRITE,
      // * CLEAN UP ON THROW" DISCIPLINE AS UserService.updateProfile.
      if (avatarUrl) {
        const filename = avatarUrl.split('/').pop();
        if (filename) {
          await this.storageService
            .deleteFile(filename, AVATAR_FOLDER)
            .catch((e) =>
              this.logger.warn(`Could not delete orphaned avatar: ${e}`),
            );
        }
      }
      if (nidDocumentUrl) {
        const filename = nidDocumentUrl.split('/').pop();
        if (filename) {
          await this.storageService
            .deleteFile(filename, NID_FOLDER)
            .catch((e) =>
              this.logger.warn(`Could not delete orphaned NID document: ${e}`),
            );
        }
      }
      throw error;
    }
  }

  async getAllDeliveryMen(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<DeliveryManResponseDto>> {
    const paginated = await this.deliveryManRepo.findAllDeliveryMen(params);
    return {
      ...paginated,
      data: paginated.data.map((row) => this.toResponseDto(row)),
    };
  }

  async getDeliveryManById(userId: number): Promise<DeliveryManResponseDto> {
    const row = await this.deliveryManRepo.findByUserId(userId);
    if (!row) {
      throw new NotFoundException(`Delivery man with ID ${userId} not found.`);
    }
    return this.toResponseDto(row);
  }

  async updateDeliveryMan(
    userId: number,
    dto: UpdateDeliveryManDto,
    avatarFile?: Express.Multer.File,
    nidDocumentFile?: Express.Multer.File,
  ): Promise<DeliveryManResponseDto> {
    const existing = await this.deliveryManRepo.findByUserId(userId);
    if (!existing) {
      throw new NotFoundException(`Delivery man with ID ${userId} not found.`);
    }

    const profileUpdateData: {
      firstName?: string;
      lastName?: string;
      name?: string;
      avatarUrl?: string | null;
    } = {};
    if (dto.firstName !== undefined) profileUpdateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) profileUpdateData.lastName = dto.lastName;
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const firstName = dto.firstName ?? existing.profile?.firstName ?? '';
      const lastName = dto.lastName ?? existing.profile?.lastName ?? '';
      profileUpdateData.name = `${firstName} ${lastName}`.trim();
    }

    let oldAvatarFilename: string | undefined;
    if (avatarFile) {
      const saved = await this.storageService.saveFile(
        avatarFile,
        AVATAR_FOLDER,
      );
      profileUpdateData.avatarUrl = saved.path;
      if (existing.profile?.avatarUrl) {
        oldAvatarFilename = existing.profile.avatarUrl.split('/').pop();
      }
    } else if (dto.removeAvatar && existing.profile?.avatarUrl) {
      profileUpdateData.avatarUrl = null;
      oldAvatarFilename = existing.profile.avatarUrl.split('/').pop();
    }

    const deliveryManUpdateData: Prisma.DeliveryManProfileUpdateInput = {};
    if (dto.vehicleType !== undefined) deliveryManUpdateData.vehicleType = dto.vehicleType;
    if (dto.vehicleRegistrationNo !== undefined) deliveryManUpdateData.vehicleRegistrationNo = dto.vehicleRegistrationNo;
    if (dto.drivingLicenseNo !== undefined) deliveryManUpdateData.drivingLicenseNo = dto.drivingLicenseNo;
    if (dto.coverageArea !== undefined) deliveryManUpdateData.coverageArea = dto.coverageArea;
    if (dto.employmentType !== undefined) deliveryManUpdateData.employmentType = dto.employmentType;
    if (dto.joinedAt !== undefined) deliveryManUpdateData.joinedAt = new Date(dto.joinedAt);

    let oldNidDocumentFilename: string | undefined;
    // * RESUBMISSION RESETS VERIFICATION BACK TO PENDING — AN ADMIN MUST
    // * RE-REVIEW ANY NEW NUMBER/DOCUMENT, IT CAN NEVER STAY VERIFIED/REJECTED
    // * AGAINST MATERIAL NOBODY HAS ACTUALLY LOOKED AT. SEE docs/delivery-man.md.
    if (dto.nidNumber !== undefined) {
      deliveryManUpdateData.nidNumber = dto.nidNumber;
      deliveryManUpdateData.nidVerificationStatus = NidVerificationStatus.PENDING;
      deliveryManUpdateData.nidVerifiedAt = null;
      deliveryManUpdateData.nidVerifiedByUser = { disconnect: true };
    }
    if (nidDocumentFile) {
      const saved = await this.storageService.saveFile(
        nidDocumentFile,
        NID_FOLDER,
      );
      deliveryManUpdateData.nidDocumentUrl = saved.path;
      deliveryManUpdateData.nidVerificationStatus = NidVerificationStatus.PENDING;
      deliveryManUpdateData.nidVerifiedAt = null;
      deliveryManUpdateData.nidVerifiedByUser = { disconnect: true };
      if (existing.deliveryManProfile?.nidDocumentUrl) {
        oldNidDocumentFilename = existing.deliveryManProfile.nidDocumentUrl
          .split('/')
          .pop();
      }
    }

    await this.userService.updateManagedUser(
      userId,
      {
        ...profileUpdateData,
        phone: dto.phone,
      },
      async (tx) => {
        if (Object.keys(deliveryManUpdateData).length > 0) {
          await this.deliveryManRepo.updateDeliveryManProfile(
            userId,
            deliveryManUpdateData,
            tx,
          );
        }
      },
    );

    if (oldAvatarFilename) {
      await this.storageService
        .deleteFile(oldAvatarFilename, AVATAR_FOLDER)
        .catch((e) => this.logger.warn(`Could not delete old avatar: ${e}`));
    }
    if (oldNidDocumentFilename) {
      await this.storageService
        .deleteFile(oldNidDocumentFilename, NID_FOLDER)
        .catch((e) =>
          this.logger.warn(`Could not delete old NID document: ${e}`),
        );
    }

    const updated = await this.deliveryManRepo.findByUserId(userId);
    if (!updated) {
      throw new NotFoundException(`Delivery man with ID ${userId} not found.`);
    }
    return this.toResponseDto(updated);
  }
}
