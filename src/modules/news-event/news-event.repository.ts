import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { NewsEventStatus, Prisma } from '../../generated/prisma/client';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';

const IMAGE_ORDER: Prisma.NewsEventImageOrderByWithRelationInput[] = [
  { isCover: 'desc' },
  { displayOrder: 'asc' },
  { id: 'asc' },
];

//* ADMIN — every column, type incl. isActive, full author account, gallery
const NEWS_EVENT_SELECT_ADMIN = {
  id: true,
  sid: true,
  status: true,
  title: true,
  slug: true,
  excerpt: true,
  content: true,
  titleTh: true,
  excerptTh: true,
  contentTh: true,
  startsAt: true,
  endsAt: true,
  location: true,
  locationTh: true,
  isFeatured: true,
  seoMetadata: true,
  typeId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  type: {
    select: { id: true, name: true, nameTh: true, slug: true, isActive: true },
  },
  author: {
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      profile: { select: { firstName: true, lastName: true } },
    },
  },
  images: {
    select: {
      id: true,
      url: true,
      thumbnailUrl: true,
      altText: true,
      displayOrder: true,
      isCover: true,
      createdAt: true,
    },
    orderBy: IMAGE_ORDER,
  },
} as const satisfies Prisma.NewsEventSelect;

//* PUBLIC LISTING CARD — NO BODY CONTENT, ONLY THE COVER IMAGE.
//* `id`/`typeId` ARE SELECTED FOR INTERNAL USE (RELATED LOOKUP) AND ARE
//* NEVER COPIED INTO THE PUBLIC DTOs.
const NEWS_EVENT_SELECT_CARD = {
  id: true,
  typeId: true,
  sid: true,
  slug: true,
  title: true,
  titleTh: true,
  excerpt: true,
  excerptTh: true,
  startsAt: true,
  endsAt: true,
  isFeatured: true,
  publishedAt: true,
  type: { select: { sid: true, name: true, nameTh: true, slug: true } },
  images: {
    where: { isCover: true },
    select: { url: true, thumbnailUrl: true, altText: true, isCover: true },
    take: 1,
  },
} as const satisfies Prisma.NewsEventSelect;

//* PUBLIC DETAIL — CARD + BODY, LOCATION, SEO, FULL GALLERY, AUTHOR NAME ONLY
const NEWS_EVENT_SELECT_PUBLIC_DETAIL = {
  ...NEWS_EVENT_SELECT_CARD,
  content: true,
  contentTh: true,
  location: true,
  locationTh: true,
  seoMetadata: true,
  author: {
    select: { profile: { select: { firstName: true, lastName: true } } },
  },
  images: {
    select: { url: true, thumbnailUrl: true, altText: true, isCover: true },
    orderBy: IMAGE_ORDER,
  },
} as const satisfies Prisma.NewsEventSelect;

type CardPayload = Prisma.NewsEventGetPayload<{
  select: typeof NEWS_EVENT_SELECT_CARD;
}>;

@Injectable()
export class NewsEventRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  //* THE ONE DEFINITION OF "VISIBLE ON THE STOREFRONT". A FUTURE publishedAt
  //* MEANS SCHEDULED — IT GOES LIVE WITHOUT ANY CRON JOB. DEACTIVATING A TYPE
  //* HIDES EVERY POST OF THAT TYPE FROM THE STOREFRONT (LIST, DETAIL AND
  //* RELATED); THE POSTS THEMSELVES ARE UNTOUCHED AND STAY IN THE ADMIN TABLE.
  publicVisibilityWhere(now = new Date()): Prisma.NewsEventWhereInput {
    return {
      status: NewsEventStatus.ACTIVE,
      deletedAt: null,
      publishedAt: { lte: now },
      type: { isActive: true },
    };
  }

  // ─── Reads — Single ──────────────────────────────────────────────────────────

  //* INCLUDES SOFT-DELETED (ARCHIVED) ROWS — ADMIN CAN OPEN AN ARCHIVED POST
  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEvent.findUnique({
      where: { id },
      select: NEWS_EVENT_SELECT_ADMIN,
    });
  }

  async findPublicBySlug(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEvent.findFirst({
      where: { slug, ...this.publicVisibilityWhere() },
      select: NEWS_EVENT_SELECT_PUBLIC_DETAIL,
    });
  }

  async findPublicIdentityBySlug(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEvent.findFirst({
      where: { slug, ...this.publicVisibilityWhere() },
      select: { id: true, typeId: true },
    });
  }

  //* SLUGS STAY UNIQUE ACROSS SOFT-DELETED ROWS, SO THIS CHECKS EVERY ROW
  async slugExists(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    const row = await client.newsEvent.findUnique({
      where: { slug },
      select: { id: true },
    });
    return row !== null;
  }

  async findImages(newsEventId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEventImage.findMany({
      where: { newsEventId },
      select: { id: true, url: true, isCover: true, displayOrder: true },
      orderBy: IMAGE_ORDER,
    });
  }

  // ─── Reads — Lists ───────────────────────────────────────────────────────────

  async findAllAdmin(
    params: PaginationQueryDto,
    where: Prisma.NewsEventWhereInput,
    sortField: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const select = NEWS_EVENT_SELECT_ADMIN;
    return this.paginationService.paginate<
      Prisma.NewsEventGetPayload<{ select: typeof select }>,
      typeof client.newsEvent
    >(client.newsEvent, params, {
      select,
      where,
      searchableFields: ['title', 'titleTh'],
      defaultSortField: sortField,
    });
  }

  async findAllPublic(
    params: PaginationQueryDto,
    where: Prisma.NewsEventWhereInput,
    sortField: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const select = NEWS_EVENT_SELECT_CARD;
    return this.paginationService.paginate<
      CardPayload,
      typeof client.newsEvent
    >(client.newsEvent, params, {
      select,
      //* AND, NOT A SPREAD — BOTH SIDES CAN CARRY A `type` CONDITION (THE
      //* ?type= SLUG FILTER vs type.isActive) AND A SPREAD WOULD DROP ONE
      where: { AND: [where, this.publicVisibilityWhere()] },
      searchableFields: ['title', 'titleTh'],
      defaultSortField: sortField,
    });
  }

  /**
   * "You May Also Like": latest visible posts of the same type first, then
   * topped up with the latest visible posts of any other type. Two small
   * indexed queries instead of one ORDER BY CASE that can't use an index.
   */
  async findRelatedPublic(
    excludeId: number,
    typeId: number,
    limit: number,
    tx?: Prisma.TransactionClient,
  ): Promise<CardPayload[]> {
    const client = tx || this.prisma;
    const visible = this.publicVisibilityWhere();
    const orderBy: Prisma.NewsEventOrderByWithRelationInput[] = [
      { publishedAt: 'desc' },
      { id: 'desc' },
    ];

    const sameType = await client.newsEvent.findMany({
      where: { ...visible, typeId, id: { not: excludeId } },
      select: NEWS_EVENT_SELECT_CARD,
      orderBy,
      take: limit,
    });
    if (sameType.length >= limit) return sameType;

    const others = await client.newsEvent.findMany({
      where: { ...visible, typeId: { not: typeId }, id: { not: excludeId } },
      select: NEWS_EVENT_SELECT_CARD,
      orderBy,
      take: limit - sameType.length,
    });
    return [...sameType, ...others];
  }

  // ─── Mutations — Post ────────────────────────────────────────────────────────

  async createNewsEvent(
    data: Prisma.NewsEventUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.newsEvent.create({ data, select: NEWS_EVENT_SELECT_ADMIN });
  }

  async updateNewsEvent(
    id: number,
    data: Prisma.NewsEventUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.newsEvent.update({
      where: { id },
      data,
      select: NEWS_EVENT_SELECT_ADMIN,
    });
  }

  //* SOFT DELETE — ROW, IMAGES AND FILES ARE KEPT SO restore IS LOSSLESS.
  //* status ARCHIVED IS WHAT THE ADMIN TABLE SHOWS; deletedAt IS WHAT THE
  //* AuditLog EXTENSION READS TO RECORD A SOFT_DELETE (AND WHEN IT HAPPENED).
  async softDeleteNewsEvent(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEvent.update({
      where: { id },
      data: { deletedAt: new Date(), status: NewsEventStatus.ARCHIVED },
      select: { id: true },
    });
  }

  //* COMES BACK INACTIVE, NOT ACTIVE — AN ADMIN RE-PUBLISHES IT DELIBERATELY
  //* RATHER THAN A RESTORE PUTTING OLD CONTENT STRAIGHT BACK ON THE STOREFRONT
  async restoreNewsEvent(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.newsEvent.update({
      where: { id },
      data: { deletedAt: null, status: NewsEventStatus.INACTIVE },
      select: NEWS_EVENT_SELECT_ADMIN,
    });
  }

  // ─── Mutations — Images ──────────────────────────────────────────────────────

  async createImages(
    data: Prisma.NewsEventImageCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.newsEventImage.createManyAndReturn({
      data,
      select: { id: true },
    });
  }

  async deleteImages(
    newsEventId: number,
    imageIds: number[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.newsEventImage.deleteMany({
      where: { newsEventId, id: { in: imageIds } },
    });
  }

  //* CLEARS THE OLD COVER AND SETS THE NEW ONE — CALL INSIDE A TRANSACTION
  async setCoverImage(
    newsEventId: number,
    imageId: number,
    tx: Prisma.TransactionClient,
  ) {
    await tx.newsEventImage.updateMany({
      where: { newsEventId, isCover: true, id: { not: imageId } },
      data: { isCover: false },
    });
    await tx.newsEventImage.update({
      where: { id: imageId },
      data: { isCover: true },
    });
  }
}
