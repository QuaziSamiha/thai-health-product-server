import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  MinifiedUser,
  UserMinifiedResponseDto,
} from '../../user/dto/user-response.dto';
import { toAbsoluteUrl } from '../../../common/utils/url.util';

export { UserMinifiedResponseDto, toAbsoluteUrl };
export type { MinifiedUser };

//* ═══════════════════════════════════════════════════════════════════════
//* SHARED BUILDING BLOCKS — REUSED ACROSS EVERY COMBO RESPONSE VARIANT
//* (combo-product-response.dto.ts, combo-image-response.dto.ts,
//* combo-item-response.dto.ts)
//* ═══════════════════════════════════════════════════════════════════════

export class ComboSeoMetadataDto {
  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <title> tag in English',
    example: 'Wellness Starter Bundle | Save 350 THB',
  })
  metaTitle?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <meta description> tag in English',
    example: 'Everything you need to start your wellness journey.',
  })
  metaDescription?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <title> tag in Thai',
  })
  metaTitleTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <meta description> tag in Thai',
  })
  metaDescriptionTh?: string;
}

//* seoMetadata IS A JSONB COLUMN WITH NO DB-LEVEL SCHEMA — NARROW THE
//* UNKNOWN SHAPE HERE SO SWAGGER DOCUMENTS A REAL STRUCTURE INSTEAD OF AN
//* OPAQUE `object`.
export function toSeoMetadataDto(
  value: unknown,
): ComboSeoMetadataDto | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const dto = new ComboSeoMetadataDto();
  dto.metaTitle = typeof raw.metaTitle === 'string' ? raw.metaTitle : undefined;
  dto.metaDescription =
    typeof raw.metaDescription === 'string' ? raw.metaDescription : undefined;
  dto.metaTitleTh =
    typeof raw.metaTitleTh === 'string' ? raw.metaTitleTh : undefined;
  dto.metaDescriptionTh =
    typeof raw.metaDescriptionTh === 'string'
      ? raw.metaDescriptionTh
      : undefined;
  return dto;
}

export function toPrice(value: unknown): number | undefined {
  return value !== null && value !== undefined ? Number(value) : undefined;
}
