import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import {
  Prisma,
  SupportStatus,
  SupportType,
} from '../../generated/prisma/client';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';

@Injectable()
export class SupportRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  //* ADMIN — full detail: status, raw audit FKs, plus the resolved
  //* creator/updater for the back-office dashboard. Never reuse for a
  //* public/unauthenticated route.
  private readonly SUPPORT_SELECT_ADMIN = {
    id: true,
    sid: true,
    type: true,
    status: true,
    title: true,
    slug: true,
    content: true,
    note: true,
    titleTh: true,
    contentTh: true,
    noteTh: true,
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

  //* PUBLIC — storefront view: no `status` (internal workflow state — only
  //* ACTIVE rows are ever queried for this shape) and no audit fields.
  private readonly SUPPORT_SELECT_PUBLIC = {
    id: true,
    sid: true,
    type: true,
    title: true,
    slug: true,
    content: true,
    note: true,
    titleTh: true,
    contentTh: true,
    noteTh: true,
  } as const;

  // ─── Reads — Single Lookups ──────────────────────────────────────────────────

  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.support.findUnique({
      where: { id },
      select: this.SUPPORT_SELECT_ADMIN,
    });
  }

  async findBySlug(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.support.findUnique({
      where: { slug },
      select: this.SUPPORT_SELECT_ADMIN,
    });
  }

  async findActiveBySlug(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.support.findFirst({
      where: { slug, status: SupportStatus.ACTIVE },
      select: this.SUPPORT_SELECT_PUBLIC,
    });
  }

  //* THE FIVE NAMED POLICY TYPES HOLD AT MOST ONE ACTIVE ROW EACH — ENFORCED BY
  //* THE PARTIAL UNIQUE INDEX support_pages_active_type_key (SEE support.prisma),
  //* SO "THE ACTIVE ROW FOR A TYPE" IS WELL-DEFINED FOR THEM. `OTHERS` IS EXCLUDED
  //* FROM THAT INDEX AND CAN HAVE MANY ACTIVE ROWS — LOOK THOSE UP BY slug VIA
  //* findActiveBySlug INSTEAD.
  //*
  //* THE orderBy IS BELT-AND-BRACES: IT MAKES THE RESULT DETERMINISTIC (NEWEST
  //* EDIT WINS) FOR `OTHERS`, AND FOR ANY NAMED-TYPE DUPLICATE THAT PREDATES THE
  //* INDEX, INSTEAD OF LEAVING THE CHOICE TO THE QUERY PLANNER.
  async findActiveByType(type: SupportType, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.support.findFirst({
      where: { type, status: SupportStatus.ACTIVE },
      select: this.SUPPORT_SELECT_PUBLIC,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  // ─── Reads — Lists ───────────────────────────────────────────────────────────

  async findAllAdmin(
    params: PaginationQueryDto,
    type?: SupportType,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const select = this.SUPPORT_SELECT_ADMIN;
    return await this.paginationService.paginate<
      Prisma.SupportGetPayload<{ select: typeof select }>,
      typeof client.support
    >(client.support, params, {
      select,
      where: type ? { type } : undefined,
      searchableFields: ['title', 'titleTh'],
      defaultSortField: 'createdAt',
    });
  }

  /** Every ACTIVE row across all types — backs the storefront tab list. */
  async findActiveTabs(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.support.findMany({
      where: { status: SupportStatus.ACTIVE },
      select: this.SUPPORT_SELECT_PUBLIC,
      orderBy: { type: 'asc' },
    });
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async createSupport(
    data: Prisma.SupportUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.support.create({
      data,
      select: this.SUPPORT_SELECT_ADMIN,
    });
  }

  async updateSupport(
    id: number,
    data: Prisma.SupportUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.support.update({
      where: { id },
      data,
      select: this.SUPPORT_SELECT_ADMIN,
    });
  }

  async deleteSupport(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.support.delete({
      where: { id },
      select: { id: true },
    });
  }
}
