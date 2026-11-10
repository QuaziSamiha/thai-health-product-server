import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { NewsEventStatus } from '../../generated/prisma/enums';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';

//* MATCHES UserMinifiedResponseDto / MinifiedUser (user/dto/user-response.dto.ts)
const MINIFIED_USER_SELECT = {
  select: {
    id: true,
    email: true,
    status: true,
    role: true,
    profile: { select: { firstName: true, lastName: true } },
  },
} as const;

@Injectable()
export class NewsEventTypeRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  //* ADMIN — full detail + live (non-deleted) usage count + audit users
  private readonly TYPE_SELECT_ADMIN = {
    id: true,
    sid: true,
    name: true,
    nameTh: true,
    slug: true,
    isActive: true,
    displayOrder: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    createdByUser: MINIFIED_USER_SELECT,
    updatedByUser: MINIFIED_USER_SELECT,
    _count: { select: { newsEvents: { where: { deletedAt: null } } } },
  } as const;

  //* PUBLIC — storefront filter list
  private readonly TYPE_SELECT_PUBLIC = {
    sid: true,
    name: true,
    nameTh: true,
    slug: true,
  } as const;

  // ─── Reads ───────────────────────────────────────────────────────────────────

  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEventType.findUnique({
      where: { id },
      select: this.TYPE_SELECT_ADMIN,
    });
  }

  //* LEAN CHECK — USED BY NewsEventService BEFORE ASSIGNING A TYPE (EXISTS + ACTIVE)
  async findIdById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEventType.findUnique({
      where: { id },
      select: { id: true, isActive: true, deletedAt: true },
    });
  }

  //* NAME OR SLUG CLASH AMONG NON-ARCHIVED TYPES — CASE-INSENSITIVE ON NAME
  //* ("Event" vs "event"). ARCHIVED TYPES FREE THEIR NAME (PARTIAL UNIQUE INDEXES)
  async findConflicting(
    name: string,
    slug: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.newsEventType.findFirst({
      where: {
        deletedAt: null,
        OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }],
      },
      select: { id: true },
    });
  }

  async findAllAdmin(
    params: PaginationQueryDto,
    isActive?: boolean,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const select = this.TYPE_SELECT_ADMIN;
    return this.paginationService.paginate<
      Prisma.NewsEventTypeGetPayload<{ select: typeof select }>,
      typeof client.newsEventType
    >(client.newsEventType, params, {
      select,
      where: isActive === undefined ? undefined : { isActive },
      searchableFields: ['name', 'nameTh'],
      defaultSortField: 'displayOrder',
    });
  }

  async findAllActive(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEventType.findMany({
      where: { isActive: true, deletedAt: null },
      select: this.TYPE_SELECT_PUBLIC,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  //* ADMIN POST FORM DROPDOWN — ACTIVE TYPES ONLY, WITH THE id THE FORM SUBMITS.
  //* NO PAGINATION: THE LIST IS SMALL AND THE DROPDOWN NEEDS ALL OF IT.
  async findActiveOptions(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEventType.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, nameTh: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  //* POSTS THAT BLOCK ARCHIVING A TYPE: status ACTIVE AND NOT ARCHIVED.
  //* INACTIVE / DRAFT / ARCHIVED POSTS DO NOT BLOCK IT.
  async countActiveNewsEvents(typeId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEvent.count({
      where: { typeId, status: NewsEventStatus.ACTIVE, deletedAt: null },
    });
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async createType(
    data: Prisma.NewsEventTypeUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.newsEventType.create({
      data,
      select: this.TYPE_SELECT_ADMIN,
    });
  }

  async updateType(
    id: number,
    data: Prisma.NewsEventTypeUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.newsEventType.update({
      where: { id },
      data,
      select: this.TYPE_SELECT_ADMIN,
    });
  }

  //* ARCHIVE (SOFT DELETE) — ONE-WAY. isActive IS FORCED OFF SO EVERY
  //* isActive FILTER (STOREFRONT, POST VISIBILITY) ALREADY EXCLUDES IT.
  async archiveType(id: number, userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEventType.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
      select: { id: true },
    });
  }
}
