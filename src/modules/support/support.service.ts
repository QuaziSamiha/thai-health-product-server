import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SupportRepository } from './support.repository';
import { CreateSupportDto } from './dto/create-support.dto';
import { UpdateSupportDto } from './dto/update-support.dto';
import { SupportQueryDto } from './dto/support-query.dto';
import {
  SupportResponseDto,
  SupportResponsePublicDto,
} from './dto/support-response.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { IPaginatedResult } from '../../shared/pagination';
import { SupportType } from '../../generated/prisma/enums';

@Injectable()
export class SupportService {
  constructor(private readonly supportRepository: SupportRepository) {}

  async createSupport(
    userId: number,
    createSupportDto: CreateSupportDto,
  ): Promise<SupportResponseDto> {
    const { title, ...rest } = createSupportDto;

    const slug = generateSlug(title);
    const existing = await this.supportRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException(
        'A support page with this title already exists',
      );
    }

    const newSupport = await this.supportRepository.createSupport({
      ...rest,
      title,
      slug,
      createdBy: userId,
    });

    return new SupportResponseDto(newSupport);
  }

  async getAllSupports(
    params: SupportQueryDto,
  ): Promise<IPaginatedResult<SupportResponseDto>> {
    const { type, ...paginationParams } = params;
    const paginatedSupports = await this.supportRepository.findAllAdmin(
      paginationParams,
      type,
    );

    return {
      ...paginatedSupports,
      data: paginatedSupports.data.map(
        (support) => new SupportResponseDto(support),
      ),
    };
  }

  /** Every ACTIVE row across all types, ordered — backs the storefront tab list. */
  async getActiveTabs(): Promise<SupportResponsePublicDto[]> {
    const supports = await this.supportRepository.findActiveTabs();
    return supports.map((support) => new SupportResponsePublicDto(support));
  }

  async getActiveSupportByType(
    type: SupportType,
  ): Promise<SupportResponsePublicDto> {
    const support = await this.supportRepository.findActiveByType(type);
    if (!support) {
      throw new NotFoundException(
        `No active support page found for type ${type}`,
      );
    }
    return new SupportResponsePublicDto(support);
  }

  async getActiveSupportBySlug(
    slug: string,
  ): Promise<SupportResponsePublicDto> {
    const support = await this.supportRepository.findActiveBySlug(slug);
    if (!support) {
      throw new NotFoundException('Support page not found');
    }
    return new SupportResponsePublicDto(support);
  }

  async updateSupport(
    id: number,
    userId: number,
    updateSupportDto: UpdateSupportDto,
  ): Promise<SupportResponseDto> {
    const support = await this.supportRepository.findByIdAdmin(id);
    if (!support) {
      throw new NotFoundException(`Support page with ID ${id} not found`);
    }

    const { title, ...rest } = updateSupportDto;
    const updateData: Partial<UpdateSupportDto> & { slug?: string } = {
      ...rest,
    };

    if (title && title !== support.title) {
      const newSlug = generateSlug(title);
      const existingSlug = await this.supportRepository.findBySlug(newSlug);
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException(
          'New title results in a duplicate support page',
        );
      }
      updateData.title = title;
      updateData.slug = newSlug;
    }

    const updatedSupport = await this.supportRepository.updateSupport(id, {
      ...updateData,
      updatedBy: userId,
    });

    return new SupportResponseDto(updatedSupport);
  }

  async deleteSupport(id: number): Promise<void> {
    const support = await this.supportRepository.findByIdAdmin(id);
    if (!support) {
      throw new NotFoundException(`Support with ID ${id} not found`);
    }
    await this.supportRepository.deleteSupport(id);
  }
}
