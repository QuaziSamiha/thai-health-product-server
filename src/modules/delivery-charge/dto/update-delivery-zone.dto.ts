import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import {
  CreateDeliveryZoneDto,
  DeliveryAreaInputDto,
  DeliveryRateInputDto,
} from './create-delivery-zone.dto';

/**
 * Partial update of a zone.
 *
 * `areas` and `rates` are re-declared rather than inherited as optional
 * arrays because their update semantics are not "merge", they are **replace
 * wholesale**: sending `areas` swaps the zone's entire coverage set for the
 * one supplied, and omitting it leaves the existing set untouched.
 *
 * Declarative replacement is the right shape for both, and for the same
 * reason: they are sets with no stable client-visible identity. An admin edits
 * a coverage table or a rate card as one grid and saves the grid — asking them
 * to diff it into per-row create/update/delete calls would put the burden of
 * keeping the card consistent (no gaps, no overlaps, exactly one open-ended
 * band) on the client, where it cannot be enforced. Replacing the whole set
 * inside one transaction means the card is never half-migrated, and the
 * database's own overlap constraint sees only the finished state.
 *
 * The cost is that rate `sid`s are not stable across an edit. That is
 * acceptable precisely because nothing references them: orders snapshot the
 * fee they were charged (Order.deliveryChargeBase), never the tier that
 * produced it.
 */
export class UpdateDeliveryZoneDto extends PartialType(
  OmitType(CreateDeliveryZoneDto, ['areas', 'rates'] as const),
) {
  @ApiPropertyOptional({
    description:
      "Replaces the zone's entire coverage set. Omit to leave it untouched; send an empty array to clear it.",
    type: [DeliveryAreaInputDto],
  })
  @IsOptional()
  @IsArray({ message: 'Areas must be an array' })
  @ArrayMaxSize(500, {
    message: 'A zone cannot carry more than 500 area rules',
  })
  @ValidateNested({ each: true })
  @Type(() => DeliveryAreaInputDto)
  areas?: DeliveryAreaInputDto[];

  @ApiPropertyOptional({
    description:
      "Replaces the zone's entire rate card. Omit to leave it untouched. Cannot be emptied — a zone with no bands prices nothing.",
    type: [DeliveryRateInputDto],
  })
  @IsOptional()
  @IsArray({ message: 'Rates must be an array' })
  @ArrayMinSize(1, { message: 'At least one rate band is required' })
  @ArrayMaxSize(50, { message: 'A zone cannot carry more than 50 rate bands' })
  @ValidateNested({ each: true })
  @Type(() => DeliveryRateInputDto)
  rates?: DeliveryRateInputDto[];
}
