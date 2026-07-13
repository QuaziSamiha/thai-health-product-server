import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { PaginationService } from '../../shared/pagination';

@Injectable()
export class ComboProductRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  //* ADMIN — full detail: raw workflow `status`, soft-delete/publish
  //* timestamps, plus the resolved creator/updater for the back-office
  //* dashboard. Never reuse for a public/unauthenticated route.
  private readonly COMBO_PRODUCT_SELECT = {
    id: true,
    sid: true,
    status: true,
    title: true,
    titleTh: true,
    slug: true,
    shortDescription: true,
    shortDescTh: true,
    description: true,
    descriptionTh: true,
    totalPrice: true,
    comboPrice: true,
    startsAt: true,
    endsAt: true,
    isFeatured: true,
    seoMetadata: true,
    images: {
      orderBy: { displayOrder: 'asc' },
    },
    items: {
      orderBy: { displayOrder: 'asc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
            images: { select: { url: true, isPrimary: true } },
          },
        },
        variant: {
          select: { id: true, name: true, size: true, basePrice: true },
        },
      },
    },
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    publishedAt: true,
    //* MATCHES UserMinifiedResponseDto / MinifiedUser (user/dto/user-response.dto.ts)
    createdByUser: {
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        profile: { select: { name: true } },
      },
    },
    updatedByUser: {
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        profile: { select: { name: true } },
      },
    },
  } as const;

  //* PUBLIC — storefront view: no `status` (internal workflow state — only
  //* ACTIVE rows are ever queried for this shape) and no audit fields.
  private readonly COMBO_PRODUCT_SELECT_PUBLIC = {
    id: true,
    sid: true,
    title: true,
    titleTh: true,
    slug: true,
    shortDescription: true,
    shortDescTh: true,
    description: true,
    descriptionTh: true,
    totalPrice: true,
    comboPrice: true,
    startsAt: true,
    endsAt: true,
    isFeatured: true,
    seoMetadata: true,
    images: {
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    },
    items: {
      orderBy: { displayOrder: 'asc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
            images: { select: { url: true, isPrimary: true } },
          },
        },
        variant: {
          select: { id: true, name: true, size: true, basePrice: true },
        },
      },
    },
    publishedAt: true,
  } as const;
}
