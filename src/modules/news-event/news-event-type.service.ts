import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NewsEventTypeRepository } from './news-event-type.repository';
import { CreateNewsEventTypeDto } from './dto/create-news-event-type.dto';
import { UpdateNewsEventTypeDto } from './dto/update-news-event-type.dto';
import { NewsEventTypeQueryDto } from './dto/news-event-type-query.dto';
import {
  NewsEventTypeOptionDto,
  NewsEventTypePublicDto,
  NewsEventTypeResponseDto,
} from './dto/news-event-type-response.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { IPaginatedResult } from '../../shared/pagination';

@Injectable()
export class NewsEventTypeService {
  constructor(private readonly typeRepository: NewsEventTypeRepository) {}

  async createType(
    userId: number,
    dto: CreateNewsEventTypeDto,
  ): Promise<NewsEventTypeResponseDto> {
    const slug = this.toSlug(dto.name);
    await this.assertNoConflict(dto.name, slug);

    const type = await this.typeRepository.createType({
      name: dto.name,
      nameTh: dto.nameTh,
      slug,
      isActive: dto.isActive,
      displayOrder: dto.displayOrder,
      createdBy: userId,
      updatedBy: userId,
    });
    return new NewsEventTypeResponseDto(type);
  }

  async getAllTypes(
    query: NewsEventTypeQueryDto,
  ): Promise<IPaginatedResult<NewsEventTypeResponseDto>> {
    const { isActive, ...paginationParams } = query;
    const result = await this.typeRepository.findAllAdmin(
      paginationParams,
      isActive,
    );
    return {
      ...result,
      data: result.data.map((type) => new NewsEventTypeResponseDto(type)),
    };
  }

  /** Active types as { id, name, nameTh } — backs the admin post form's Type dropdown. */
  async getActiveTypeOptions(): Promise<NewsEventTypeOptionDto[]> {
    const types = await this.typeRepository.findActiveOptions();
    return types.map((type) => new NewsEventTypeOptionDto(type));
  }

  /** Active types, ordered — backs the storefront filter list. */
  async getActiveTypes(): Promise<NewsEventTypePublicDto[]> {
    const types = await this.typeRepository.findAllActive();
    return types.map((type) => new NewsEventTypePublicDto(type));
  }

  async getTypeById(id: number): Promise<NewsEventTypeResponseDto> {
    const type = await this.typeRepository.findByIdAdmin(id);
    if (!type) {
      throw new NotFoundException(`News & event type with ID ${id} not found`);
    }
    return new NewsEventTypeResponseDto(type);
  }

  async updateType(
    id: number,
    userId: number,
    dto: UpdateNewsEventTypeDto,
  ): Promise<NewsEventTypeResponseDto> {
    const existing = await this.typeRepository.findByIdAdmin(id);
    if (!existing) {
      throw new NotFoundException(`News & event type with ID ${id} not found`);
    }

    let slug: string | undefined;
    if (dto.name && dto.name !== existing.name) {
      slug = this.toSlug(dto.name);
      await this.assertNoConflict(dto.name, slug, id);
    }

    const type = await this.typeRepository.updateType(id, {
      //* NON-NULLABLE COLUMNS: A null FROM A JSON BODY MEANS "NOT PROVIDED"
      name: dto.name ?? undefined,
      slug,
      nameTh: dto.nameTh,
      isActive: dto.isActive ?? undefined,
      displayOrder: dto.displayOrder ?? undefined,
      updatedBy: userId,
    });
    return new NewsEventTypeResponseDto(type);
  }

  /**
   * Hard delete, allowed only while no post (soft-deleted ones included —
   * they still reference it) uses the type. Otherwise deactivate it instead.
   */
  async deleteType(id: number): Promise<void> {
    const type = await this.typeRepository.findIdById(id);
    if (!type) {
      throw new NotFoundException(`News & event type with ID ${id} not found`);
    }

    const usage = await this.typeRepository.countAllNewsEvents(id);
    if (usage > 0) {
      throw new ConflictException(
        `This type is used by ${usage} post(s), including deleted ones. Deactivate it instead.`,
      );
    }
    await this.typeRepository.deleteType(id);
  }

  /**
   * Used by NewsEventService before assigning a type to a post (on create,
   * and on update only when the type actually changes). An inactive type
   * hides its posts from the storefront, so filing a post under one is
   * refused — the same rule the admin dropdown (getActiveTypeOptions) shows.
   */
  async assertTypeAssignable(id: number): Promise<void> {
    const type = await this.typeRepository.findIdById(id);
    if (!type) {
      throw new BadRequestException(
        `News & event type with ID ${id} does not exist`,
      );
    }
    if (!type.isActive) {
      throw new BadRequestException(
        'This type is inactive. Choose an active type or activate it first.',
      );
    }
  }

  private toSlug(name: string): string {
    const slug = generateSlug(name);
    if (!slug) {
      throw new BadRequestException(
        'Name must contain at least one English letter or number',
      );
    }
    return slug;
  }

  private async assertNoConflict(name: string, slug: string, selfId?: number) {
    const conflict = await this.typeRepository.findConflicting(name, slug);
    if (conflict && conflict.id !== selfId) {
      throw new ConflictException(
        'A news & event type with this name already exists',
      );
    }
  }
}
