import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsEventRepository } from './news-event.repository';
import { NewsEventTypeService } from './news-event-type.service';
import { CreateNewsEventDto } from './dto/create-news-event.dto';
import { UpdateNewsEventDto } from './dto/update-news-event.dto';
import {
  NewsEventAdminQueryDto,
  NewsEventPublicQueryDto,
} from './dto/news-event-query.dto';
import {
  NewsEventCardDto,
  NewsEventPublicDto,
  NewsEventResponseDto,
} from './dto/news-event-response.dto';
import {
  NEW_IMAGE_REF_PREFIX,
  NEWS_EVENT_IMAGE_FOLDER,
  NEWS_EVENT_MAX_IMAGES,
  RELATED_NEWS_EVENTS_DEFAULT_LIMIT,
} from './news-event.constants';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
import { IPaginatedResult } from '../../shared/pagination';
import { generateSlug } from '../../common/utils/slug.util';
import { parseStoragePath } from '../../common/utils/storage-path.util';
import { NewsEventStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';

const SLUG_MAX_BASE_LENGTH = 240; //* LEAVES ROOM FOR A "-<n>" SUFFIX IN VARCHAR(255)

type CoverRef =
  | { kind: 'existing'; id: number }
  | { kind: 'new'; index: number };

@Injectable()
export class NewsEventService {
  private readonly logger = new Logger(NewsEventService.name);

  constructor(
    private readonly newsEventRepository: NewsEventRepository,
    private readonly newsEventTypeService: NewsEventTypeService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
    private readonly configService: ConfigService,
  ) {}

  private get baseUrl(): string | undefined {
    return this.configService.get<string>('app.baseUrl');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════════════════════════════════

  async createNewsEvent(
    userId: number,
    dto: CreateNewsEventDto,
    images: Express.Multer.File[],
  ): Promise<NewsEventResponseDto> {
    //* MULTER FILES ARE NOT RUN THROUGH class-validator — ENFORCE HERE
    if (images.length === 0) {
      throw new BadRequestException('At least one image is required');
    }

    await this.newsEventTypeService.assertTypeAssignable(dto.typeId);
    this.assertEventWindow(dto.startsAt, dto.endsAt);

    const status = dto.status ?? NewsEventStatus.DRAFT;
    const publishedAt = this.resolvePublishedAt(status, dto.publishedAt, null);
    const slug = await this.generateUniqueSlug(dto.title);

    const imagePaths = await this.uploadFiles(images);
    try {
      const newsEvent = await this.newsEventRepository.createNewsEvent({
        typeId: dto.typeId,
        status,
        isFeatured: dto.isFeatured ?? undefined,
        title: dto.title,
        slug,
        excerpt: dto.excerpt,
        content: dto.content,
        titleTh: dto.titleTh,
        excerptTh: dto.excerptTh,
        contentTh: dto.contentTh,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        location: dto.location,
        locationTh: dto.locationTh,
        seoMetadata: this.toSeoJson(dto.seoMetadata),
        publishedAt,
        authorId: userId,
        images: {
          create: imagePaths.map((url, index) => ({
            url,
            altText: dto.title,
            displayOrder: index,
            isCover: index === 0,
          })),
        },
      });
      return new NewsEventResponseDto(newsEvent, this.baseUrl);
    } catch (error) {
      await this.deleteFiles(imagePaths);
      throw error;
    }
  }

  async getAllNewsEvents(
    query: NewsEventAdminQueryDto,
  ): Promise<IPaginatedResult<NewsEventResponseDto>> {
    const { status, typeId, isFeatured, sortBy, ...pagination } = query;

    //* NO deletedAt FILTER — ARCHIVED (SOFT-DELETED) POSTS LIST ALONGSIDE THE
    //* REST, MARKED BY THEIR STATUS. status=ARCHIVED NARROWS TO THEM.
    const where: Prisma.NewsEventWhereInput = {
      ...(status && { status }),
      ...(typeId && { typeId }),
      ...(isFeatured !== undefined && { isFeatured }),
    };

    const result = await this.newsEventRepository.findAllAdmin(
      pagination,
      where,
      sortBy ?? 'createdAt',
    );
    return {
      ...result,
      data: result.data.map(
        (newsEvent) => new NewsEventResponseDto(newsEvent, this.baseUrl),
      ),
    };
  }

  async getNewsEventById(id: number): Promise<NewsEventResponseDto> {
    const newsEvent = await this.findOrThrow(id);
    return new NewsEventResponseDto(newsEvent, this.baseUrl);
  }

  async updateNewsEvent(
    id: number,
    dto: UpdateNewsEventDto,
    newImages: Express.Multer.File[],
  ): Promise<NewsEventResponseDto> {
    const existing = await this.findOrThrow(id);
    if (existing.deletedAt) {
      throw new ConflictException('Restore this post before editing it');
    }

    //* FILES ARRIVE VIA @UploadedFiles (newImages), NEVER IN THE BODY
    const { deleteImageIds, coverImage, ...fields } = dto;

    if (fields.typeId && fields.typeId !== existing.typeId) {
      await this.newsEventTypeService.assertTypeAssignable(fields.typeId);
    }

    this.assertEventWindow(
      fields.startsAt !== undefined ? fields.startsAt : existing.startsAt,
      fields.endsAt !== undefined ? fields.endsAt : existing.endsAt,
    );

    //* ─── Images: validate everything BEFORE touching storage ───────────────
    const deleteIds = [...new Set(deleteImageIds ?? [])];
    const existingIds = new Set(existing.images.map((image) => image.id));
    const unknownIds = deleteIds.filter((imageId) => !existingIds.has(imageId));
    if (unknownIds.length > 0) {
      throw new BadRequestException(
        `Image(s) ${unknownIds.join(', ')} do not belong to this post`,
      );
    }

    const remaining = existing.images.filter(
      (image) => !deleteIds.includes(image.id),
    );
    const totalImages = remaining.length + newImages.length;
    if (totalImages < 1) {
      throw new BadRequestException('A post must keep at least one image');
    }
    if (totalImages > NEWS_EVENT_MAX_IMAGES) {
      throw new BadRequestException(
        `A post can have at most ${NEWS_EVENT_MAX_IMAGES} images`,
      );
    }

    const coverRef = this.parseCoverRef(
      coverImage,
      remaining,
      newImages.length,
    );

    //* ─── Post fields ────────────────────────────────────────────────────────
    const effectiveStatus = fields.status ?? existing.status;
    const data: Prisma.NewsEventUncheckedUpdateInput = {
      //* NON-NULLABLE COLUMNS: A null FROM A JSON BODY MEANS "NOT PROVIDED"
      typeId: fields.typeId ?? undefined,
      status: fields.status ?? undefined,
      isFeatured: fields.isFeatured ?? undefined,
      title: fields.title ?? undefined,
      content: fields.content ?? undefined,
      //* NULLABLE COLUMNS: null CLEARS THE VALUE
      excerpt: fields.excerpt,
      titleTh: fields.titleTh,
      excerptTh: fields.excerptTh,
      contentTh: fields.contentTh,
      startsAt: fields.startsAt,
      endsAt: fields.endsAt,
      location: fields.location,
      locationTh: fields.locationTh,
      seoMetadata:
        fields.seoMetadata !== undefined
          ? this.toSeoJson(fields.seoMetadata)
          : undefined,
      publishedAt: this.resolvePublishedAt(
        effectiveStatus,
        fields.publishedAt,
        existing.publishedAt,
      ),
    };

    //* THE SLUG IS THE PUBLIC URL — ONLY RE-DERIVE IT WHILE THE POST HAS
    //* NEVER BEEN PUBLISHED, SO SHARED LINKS AND SEARCH RESULTS NEVER BREAK
    if (
      fields.title &&
      fields.title !== existing.title &&
      !existing.publishedAt
    ) {
      const candidate = generateSlug(fields.title).slice(
        0,
        SLUG_MAX_BASE_LENGTH,
      );
      if (candidate && candidate !== existing.slug) {
        data.slug = await this.generateUniqueSlug(fields.title);
      }
    }

    //* ─── Persist ────────────────────────────────────────────────────────────
    const uploadedPaths = await this.uploadFiles(newImages);
    let updated;
    try {
      updated = await this.newsEventRepository.withTransaction(async (tx) => {
        if (deleteIds.length > 0) {
          await this.newsEventRepository.deleteImages(id, deleteIds, tx);
        }

        let createdIds: number[] = [];
        if (uploadedPaths.length > 0) {
          const nextOrder =
            Math.max(-1, ...remaining.map((image) => image.displayOrder)) + 1;
          const altText = fields.title ?? existing.title;
          const created = await this.newsEventRepository.createImages(
            uploadedPaths.map((url, index) => ({
              newsEventId: id,
              url,
              altText,
              displayOrder: nextOrder + index,
              isCover: false,
            })),
            tx,
          );
          createdIds = created.map((image) => image.id);
        }

        const coverId = this.resolveCoverId(coverRef, remaining, createdIds);
        if (coverId !== undefined) {
          await this.newsEventRepository.setCoverImage(id, coverId, tx);
        }

        return this.newsEventRepository.updateNewsEvent(id, data, tx);
      });
    } catch (error) {
      await this.deleteFiles(uploadedPaths);
      throw error;
    }

    //* FILES OF REMOVED IMAGES ARE DELETED ONLY AFTER THE COMMIT SUCCEEDS
    const removedPaths = existing.images
      .filter((image) => deleteIds.includes(image.id))
      .map((image) => image.url);
    await this.deleteFiles(removedPaths);

    return new NewsEventResponseDto(updated, this.baseUrl);
  }

  /**
   * Soft delete: sets `deletedAt` only. The row, its images and files stay,
   * so it disappears from every public route but can be restored losslessly.
   * Who deleted it is recorded by the AuditLog extension (SOFT_DELETE).
   */
  async softDeleteNewsEvent(id: number): Promise<void> {
    const newsEvent = await this.findOrThrow(id);
    if (newsEvent.deletedAt) {
      throw new ConflictException('This post is already deleted');
    }
    await this.newsEventRepository.softDeleteNewsEvent(id);
  }

  async restoreNewsEvent(id: number): Promise<NewsEventResponseDto> {
    const newsEvent = await this.findOrThrow(id);
    if (!newsEvent.deletedAt) {
      throw new ConflictException('This post is not deleted');
    }
    const restored = await this.newsEventRepository.restoreNewsEvent(id);
    return new NewsEventResponseDto(restored, this.baseUrl);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC (STOREFRONT)
  // ═══════════════════════════════════════════════════════════════════════

  async getPublicNewsEvents(
    query: NewsEventPublicQueryDto,
  ): Promise<IPaginatedResult<NewsEventCardDto>> {
    const { type, isFeatured, timing, sortBy, ...pagination } = query;
    const now = new Date();

    const where: Prisma.NewsEventWhereInput = {
      ...(type && { type: { slug: type } }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(timing === 'upcoming' && { startsAt: { gte: now } }),
      ...(timing === 'past' && { startsAt: { lt: now } }),
    };

    const result = await this.newsEventRepository.findAllPublic(
      pagination,
      where,
      sortBy ?? 'publishedAt',
    );
    return {
      ...result,
      data: result.data.map(
        (newsEvent) => new NewsEventCardDto(newsEvent, this.baseUrl),
      ),
    };
  }

  async getPublicNewsEventBySlug(slug: string): Promise<NewsEventPublicDto> {
    const newsEvent = await this.newsEventRepository.findPublicBySlug(slug);
    if (!newsEvent) {
      throw new NotFoundException('News & event not found');
    }
    return new NewsEventPublicDto(newsEvent, this.baseUrl);
  }

  async getRelatedNewsEvents(
    slug: string,
    limit = RELATED_NEWS_EVENTS_DEFAULT_LIMIT,
  ): Promise<NewsEventCardDto[]> {
    const current =
      await this.newsEventRepository.findPublicIdentityBySlug(slug);
    if (!current) {
      throw new NotFoundException('News & event not found');
    }
    const related = await this.newsEventRepository.findRelatedPublic(
      current.id,
      current.typeId,
      limit,
    );
    return related.map(
      (newsEvent) => new NewsEventCardDto(newsEvent, this.baseUrl),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private async findOrThrow(id: number) {
    const newsEvent = await this.newsEventRepository.findByIdAdmin(id);
    if (!newsEvent) {
      throw new NotFoundException(`News & event with ID ${id} not found`);
    }
    return newsEvent;
  }

  private assertEventWindow(
    startsAt: Date | null | undefined,
    endsAt: Date | null | undefined,
  ): void {
    if (startsAt && endsAt && endsAt < startsAt) {
      throw new BadRequestException('endsAt cannot be before startsAt');
    }
  }

  /**
   * An explicit publishedAt (incl. a future one = scheduled) always wins.
   * Otherwise the first time a post becomes ACTIVE it is stamped with now;
   * an already-stamped date is never overwritten implicitly.
   */
  private resolvePublishedAt(
    status: NewsEventStatus,
    requested: Date | null | undefined,
    current: Date | null,
  ): Date | null | undefined {
    if (requested !== undefined && requested !== null) return requested;
    if (status === NewsEventStatus.ACTIVE && !current) return new Date();
    //* null ON A NON-ACTIVE POST CLEARS IT; OTHERWISE LEAVE IT UNCHANGED
    return requested === null && status !== NewsEventStatus.ACTIVE
      ? null
      : undefined;
  }

  //* SLUGS STAY UNIQUE ACROSS SOFT-DELETED ROWS, SO A TITLE CLASH GETS A
  //* NUMERIC SUFFIX INSTEAD OF A 409 — TWO EVENTS CAN SHARE A TITLE
  private async generateUniqueSlug(title: string): Promise<string> {
    const base =
      generateSlug(title).slice(0, SLUG_MAX_BASE_LENGTH).replace(/-+$/, '') ||
      'news-event';
    let slug = base;
    for (
      let suffix = 2;
      await this.newsEventRepository.slugExists(slug);
      suffix++
    ) {
      slug = `${base}-${suffix}`;
    }
    return slug;
  }

  private parseCoverRef(
    coverImage: string | undefined,
    remaining: { id: number }[],
    newCount: number,
  ): CoverRef | undefined {
    if (!coverImage) return undefined;

    if (coverImage.startsWith(NEW_IMAGE_REF_PREFIX)) {
      const index = Number(coverImage.slice(NEW_IMAGE_REF_PREFIX.length));
      if (index >= newCount) {
        throw new BadRequestException(
          `coverImage ${coverImage} does not match an uploaded file`,
        );
      }
      return { kind: 'new', index };
    }

    const id = Number(coverImage);
    if (!remaining.some((image) => image.id === id)) {
      throw new BadRequestException(
        `coverImage ${id} is not an existing image of this post`,
      );
    }
    return { kind: 'existing', id };
  }

  //* undefined = KEEP THE CURRENT COVER
  private resolveCoverId(
    ref: CoverRef | undefined,
    remaining: { id: number; isCover: boolean }[],
    createdIds: number[],
  ): number | undefined {
    if (ref?.kind === 'existing') return ref.id;
    if (ref?.kind === 'new') return createdIds[ref.index];
    if (remaining.some((image) => image.isCover)) return undefined;
    //* COVER WAS DELETED (OR NEVER SET) — PROMOTE THE FIRST IMAGE LEFT
    return remaining[0]?.id ?? createdIds[0];
  }

  private toSeoJson(
    seo: CreateNewsEventDto['seoMetadata'],
  ): Prisma.InputJsonValue | undefined {
    return seo ? ({ ...seo } as Prisma.InputJsonValue) : undefined;
  }

  private async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
    const paths: string[] = [];
    try {
      for (const file of files) {
        const saved = await this.storageService.saveFile(
          file,
          NEWS_EVENT_IMAGE_FOLDER,
        );
        paths.push(saved.path);
      }
      return paths;
    } catch (error) {
      await this.deleteFiles(paths);
      throw error;
    }
  }

  private async deleteFiles(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map((path) => {
        const { filename, folder } = parseStoragePath(path);
        return this.storageService
          .deleteFile(filename, folder)
          .catch((e) =>
            this.logger.warn(`Could not delete news & event image: ${e}`),
          );
      }),
    );
  }
}
