import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliveryAvailability,
  DeliveryEmploymentType,
  DeliveryVehicleType,
  NidVerificationStatus,
  UserStatus,
} from '../../../generated/prisma/client';
import {
  AddressModel,
  DeliveryManProfileModel,
  ProfileModel,
  UserModel,
} from '../../../generated/prisma/models';

//* nidDocumentUrl IS SERVED FROM THE SAME PUBLIC /uploads/** ROOT AS EVERY
//* OTHER UPLOAD IN THIS APP FOR NOW — SEE docs/delivery-man.md "NID / KYC
//* Verification Workflow" FOR WHY THIS SHOULD MOVE BEHIND AN AUTHENTICATED/
//* SIGNED ROUTE BEFORE THIS MODULE IS CONSIDERED PRODUCTION-READY. EVERY
//* ROUTE THAT CAN RETURN THIS DTO IS ADMIN-ONLY IN THE MEANTIME.
export class DeliveryManResponseDto {
  @ApiProperty({ description: 'User ID', example: 41 })
  id!: number;

  @ApiProperty({ description: 'Public identifier' })
  sid!: string;

  @ApiProperty({ description: 'Email address' })
  email!: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  phone?: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ description: 'Account creation time' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Display name' })
  name?: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Absolute URL of the profile photo' })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: "The delivery man's default/first saved address, if any",
  })
  address?: {
    addressLine: string;
    state: string;
    region: string;
  };

  @ApiPropertyOptional({ description: 'Thai national ID number (13 digits)' })
  nidNumber?: string;

  @ApiPropertyOptional({ description: 'Absolute URL of the uploaded NID scan/PDF' })
  nidDocumentUrl?: string;

  @ApiProperty({ enum: NidVerificationStatus })
  nidVerificationStatus!: NidVerificationStatus;

  @ApiPropertyOptional()
  nidVerifiedAt?: Date;

  @ApiPropertyOptional({ enum: DeliveryVehicleType })
  vehicleType?: DeliveryVehicleType;

  @ApiPropertyOptional()
  vehicleRegistrationNo?: string;

  @ApiPropertyOptional()
  drivingLicenseNo?: string;

  @ApiProperty({ enum: DeliveryAvailability })
  availability!: DeliveryAvailability;

  @ApiPropertyOptional()
  coverageArea?: string;

  @ApiPropertyOptional({ enum: DeliveryEmploymentType })
  employmentType?: DeliveryEmploymentType;

  @ApiPropertyOptional()
  joinedAt?: Date;

  @ApiProperty()
  codCollectionEnabled!: boolean;

  @ApiProperty({ description: 'Cash currently held, pending settlement' })
  codBalance!: number;

  @ApiProperty({
    description: 'Denormalized cache — see docs/delivery-man.md Known Gaps',
  })
  completedDeliveryCount!: number;

  @ApiPropertyOptional({ description: '0.00-5.00, denormalized cache' })
  rating?: number;

  constructor(
    row: Partial<UserModel> & {
      profile?: Partial<ProfileModel> | null;
      addresses?: Partial<AddressModel>[];
      deliveryManProfile?: Partial<DeliveryManProfileModel> | null;
    },
    baseUrl?: string,
  ) {
    this.id = row.id!;
    this.sid = row.sid!;
    this.email = row.email!;
    this.phone = row.phone ?? undefined;
    this.status = row.status!;
    this.createdAt = row.createdAt!;

    this.name = row.profile?.name ?? undefined;
    this.firstName = row.profile?.firstName ?? undefined;
    this.lastName = row.profile?.lastName ?? undefined;
    this.avatarUrl = row.profile?.avatarUrl
      ? row.profile.avatarUrl.startsWith('http')
        ? row.profile.avatarUrl
        : `${baseUrl}${row.profile.avatarUrl}`
      : undefined;

    const defaultAddress = row.addresses?.[0];
    this.address = defaultAddress
      ? {
          addressLine: defaultAddress.addressLine!,
          state: defaultAddress.state!,
          region: defaultAddress.region!,
        }
      : undefined;

    const dm = row.deliveryManProfile;
    this.nidNumber = dm?.nidNumber ?? undefined;
    this.nidDocumentUrl = dm?.nidDocumentUrl
      ? dm.nidDocumentUrl.startsWith('http')
        ? dm.nidDocumentUrl
        : `${baseUrl}${dm.nidDocumentUrl}`
      : undefined;
    this.nidVerificationStatus =
      dm?.nidVerificationStatus ?? NidVerificationStatus.PENDING;
    this.nidVerifiedAt = dm?.nidVerifiedAt ?? undefined;
    this.vehicleType = dm?.vehicleType ?? undefined;
    this.vehicleRegistrationNo = dm?.vehicleRegistrationNo ?? undefined;
    this.drivingLicenseNo = dm?.drivingLicenseNo ?? undefined;
    this.availability = dm?.availability ?? DeliveryAvailability.OFFLINE;
    this.coverageArea = dm?.coverageArea ?? undefined;
    this.employmentType = dm?.employmentType ?? undefined;
    this.joinedAt = dm?.joinedAt ?? undefined;
    this.codCollectionEnabled = dm?.codCollectionEnabled ?? false;
    this.codBalance = dm?.codBalance ? Number(dm.codBalance) : 0;
    this.completedDeliveryCount = dm?.completedDeliveryCount ?? 0;
    this.rating = dm?.rating ? Number(dm.rating) : undefined;
  }
}
