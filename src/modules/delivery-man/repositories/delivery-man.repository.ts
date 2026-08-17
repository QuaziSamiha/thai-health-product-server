import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaseRepository } from '../../../prisma/base.repository';
import { Prisma, UserRole } from '../../../generated/prisma/client';
import {
  PaginationService,
  PaginationQueryDto,
} from '../../../shared/pagination';

@Injectable()
export class DeliveryManRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  private readonly PROFILE_SELECT = {
    firstName: true,
    lastName: true,
    avatarUrl: true,
  } as const;

  private readonly ADDRESS_SELECT = {
    addressLine: true,
    state: true,
    region: true,
  } as const;

  private readonly DELIVERY_MAN_PROFILE_SELECT = {
    nidNumber: true,
    nidDocumentUrl: true,
    nidVerificationStatus: true,
    nidVerifiedAt: true,
    vehicleType: true,
    vehicleRegistrationNo: true,
    drivingLicenseNo: true,
    availability: true,
    coverageArea: true,
    employmentType: true,
    joinedAt: true,
    codCollectionEnabled: true,
    codBalance: true,
    completedDeliveryCount: true,
    rating: true,
  } as const;

  //* THE DEFAULT-FIRST, NEWEST-NEXT ORDERING MATCHES AddressRepository'S OWN
  //* CONTRACT (SEE address.repository.ts) SO "ONE ADDRESS PER ROW" NEVER
  //* SILENTLY SHOWS A DIFFERENT ADDRESS THAN THE CUSTOMER-FACING PAGE WOULD.
  private readonly DETAIL_SELECT = {
    id: true,
    sid: true,
    email: true,
    phone: true,
    status: true,
    createdAt: true,
    profile: { select: this.PROFILE_SELECT },
    addresses: {
      select: this.ADDRESS_SELECT,
      take: 1,
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ] as Prisma.AddressOrderByWithRelationInput[],
    },
    deliveryManProfile: { select: this.DELIVERY_MAN_PROFILE_SELECT },
  } as const;

  async createDeliveryManProfile(
    data: Prisma.DeliveryManProfileUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.deliveryManProfile.create({ data });
  }

  async updateDeliveryManProfile(
    userId: number,
    data: Prisma.DeliveryManProfileUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.deliveryManProfile.update({ where: { userId }, data });
  }

  async findProfileByUserId(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.deliveryManProfile.findUnique({ where: { userId } });
  }

  //* role: DELIVERY_PARTNER SCOPES THIS TO IN-HOUSE STAFF ONLY — THIS IS NOT
  //* A GENERIC USER LIST. deletedAt: null MATCHES THE SOFT-DELETE CONVENTION
  //* ALREADY ESTABLISHED BY UserRepository.findUserByEmail.
  async findByUserId(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.user.findFirst({
      where: { id: userId, role: UserRole.DELIVERY_PARTNER, deletedAt: null },
      select: this.DETAIL_SELECT,
    });
  }

  async findAllDeliveryMen(params: PaginationQueryDto) {
    //* NonNullable<Awaited<ReturnType<...>>> INSTEAD OF Prisma.UserGetPayload<{
    //* select: typeof this.DETAIL_SELECT }> — THE LATTER FALLS BACK TO A
    //* USELESS "EVERY MODEL'S DELEGATE TYPE UNIONED" SHAPE HERE BECAUSE
    //* DETAIL_SELECT'S addresses.orderBy CARRIES AN EXPLICIT `as` CAST, WHICH
    //* DEFEATS Prisma's GetFindResult PATTERN MATCH ON THE TYPE (NOT VALUE)
    //* POSITION. DERIVING FROM findByUserId's OWN INFERRED RETURN TYPE SIDESTEPS IT.
    type Row = NonNullable<
      Awaited<ReturnType<DeliveryManRepository['findByUserId']>>
    >;
    return this.paginationService.paginate<Row, typeof this.prisma.user>(
      this.prisma.user,
      params,
      {
        where: { role: UserRole.DELIVERY_PARTNER, deletedAt: null },
        select: this.DETAIL_SELECT,
        searchableFields: ['email', 'phone', 'profile.firstName', 'profile.lastName'],
        defaultSortField: 'createdAt',
      },
    );
  }
}
