import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import {
  Prisma,
  HomeContentType,
  HomeContentStatus,
} from '../../generated/prisma/client';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';

//* ADMIN SELECT SHAPE — feeds HomeResponseDto (see dto/home-response.dto.ts).
//* Full detail: status, raw audit FKs, plus the resolved creator/updater for
//* the back-office dashboard. Never reuse this select for a public/
//* unauthenticated route.
const HOME_SELECT_ADMIN = {
  id: true,
  sid: true,
  type: true,
  status: true,
  heading: true,
  bodyText: true,
  headingTh: true,
  bodyTextTh: true,
  imageUrl: true,
  videoUrl: true,
  redirectUrl: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  //* MATCHES UserMinifiedResponseDto / MinifiedUser (user/dto/user-response.dto.ts)
  createdByUser: {
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      profile: {
        select: { firstName: true, lastName: true },
      },
    },
  },
  updatedByUser: {
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      profile: {
        select: { firstName: true, lastName: true },
      },
    },
  },
} as const;

//* PUBLIC SELECT SHAPE — feeds HomeResponsePublicDto. Storefront/landing-page
//* view: no `status` (internal workflow state) and no audit fields — a
//* public reader only needs the content itself.
const HOME_SELECT_PUBLIC = {
  id: true,
  sid: true,
  type: true,
  heading: true,
  bodyText: true,
  headingTh: true,
  bodyTextTh: true,
  imageUrl: true,
  videoUrl: true,
  redirectUrl: true,
  displayOrder: true,
} as const;

@Injectable()
export class HomeRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — Single Lookups ──────────────────────────────────────────────────

  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.home.findUnique({
      where: { id },
      select: HOME_SELECT_ADMIN,
    });
  }

  // ─── Reads — Lists ───────────────────────────────────────────────────────────

  async findAllAdmin(
    params: PaginationQueryDto,
    type?: HomeContentType,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.HomeGetPayload<{ select: typeof HOME_SELECT_ADMIN }>,
      typeof client.home
    >(client.home, params, {
      select: HOME_SELECT_ADMIN,
      where: type ? { type } : undefined,
      searchableFields: ['heading', 'headingTh'],
      defaultSortField: 'displayOrder',
    });
  }

  /**
   * The single ACTIVE row of `type` with the lowest displayOrder — the
   * "featured" slot rendered above the fold on the public storefront
   * homepage. `findFirst` (not `findMany`) since only one row is ever needed.
   */
  async findFeaturedByType(
    type: HomeContentType,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.home.findFirst({
      where: { type, status: HomeContentStatus.ACTIVE },
      select: HOME_SELECT_PUBLIC,
      orderBy: { displayOrder: 'asc' },
    });
  }

  // ─── Ordering ────────────────────────────────────────────────────────────────

  /** Highest displayOrder currently used within `type`, or -1 if the type has no rows yet. */
  async findMaxDisplayOrderByType(
    type: HomeContentType,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const result = await client.home.aggregate({
      where: { type },
      _max: { displayOrder: true },
    });
    return result._max.displayOrder ?? -1;
  }

  /**
   * Pushes every row of `type` at or after `fromOrder` down by one slot, freeing
   * `fromOrder` up for a row being inserted at that position. Scoped to `type`
   * so inserting a hero slide never renumbers promotion banners/OVC rows.
   */
  async shiftDisplayOrders(
    type: HomeContentType,
    fromOrder: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    await client.home.updateMany({
      where: { type, displayOrder: { gte: fromOrder } },
      data: { displayOrder: { increment: 1 } },
    });
  }

  /** Current displayOrder for a single row — read fresh inside a transaction to avoid a lost update on concurrent reorders. */
  async findDisplayOrderById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.home.findUnique({
      where: { id },
      select: { displayOrder: true },
    });
  }

  /**
   * Shifts every row of `type` whose displayOrder falls within [from, to]
   * (inclusive) by `delta` (+1 or -1). `excludeId` skips the row being moved —
   * its own displayOrder is set explicitly by the caller, not via this shift.
   */
  async shiftDisplayOrdersInRange(
    type: HomeContentType,
    from: number,
    to: number,
    delta: 1 | -1,
    excludeId: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    await client.home.updateMany({
      where: {
        type,
        id: { not: excludeId },
        displayOrder: { gte: from, lte: to },
      },
      data: { displayOrder: { increment: delta } },
    });
  }

  /**
   * Pulls every row of `type` after `deletedOrder` up by one slot, closing the
   * gap a deleted row leaves behind so the sequence stays dense (0,1,2,...)
   * instead of skipping the position the deleted row used to occupy.
   */
  async closeDisplayOrderGap(
    type: HomeContentType,
    deletedOrder: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    await client.home.updateMany({
      where: { type, displayOrder: { gt: deletedOrder } },
      data: { displayOrder: { decrement: 1 } },
    });
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async createHome(
    data: Prisma.HomeUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.home.create({
      data,
      select: HOME_SELECT_ADMIN,
    });
  }

  async updateHome(
    id: number,
    data: Prisma.HomeUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.home.update({
      where: { id },
      data,
      select: HOME_SELECT_ADMIN,
    });
  }

  async deleteHome(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.home.delete({ where: { id }, select: { id: true } });
  }
}
