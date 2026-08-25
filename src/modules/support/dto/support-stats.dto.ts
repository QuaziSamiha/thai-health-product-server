import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { SupportStatus, SupportType } from '../../../generated/prisma/enums';

/** The Support module's contribution to the admin dashboard overview. */
export class SupportStatsDto {
  @Expose()
  @ApiProperty({ description: 'Every support/policy page', example: 9 })
  total!: number;

  @Expose()
  @ApiProperty({
    description:
      'Count per `SupportStatus`, zero-filled across the whole enum.',
    example: { ACTIVE: 6, INACTIVE: 1, DRAFT: 2 },
    additionalProperties: { type: 'number' },
  })
  byStatus!: Record<SupportStatus, number>;

  @Expose()
  @ApiProperty({
    description:
      'Count per `SupportType`, zero-filled across the whole enum. A `0` on a named type means that policy page has not been written yet — every named type may hold at most one ACTIVE row, so this doubles as a coverage checklist.',
    example: {
      DELIVERY_POLICY: 1,
      TERMS_AND_CONDITIONS: 1,
      PRIVACY_POLICY: 1,
      CANCELLATION_POLICY: 1,
      RETURN_POLICY: 1,
      OTHERS: 4,
    },
    additionalProperties: { type: 'number' },
  })
  byType!: Record<SupportType, number>;

  @Expose()
  @ApiProperty({ description: 'Pages live on the storefront', example: 6 })
  active!: number;

  constructor(init: {
    total: number;
    byStatus: Record<SupportStatus, number>;
    byType: Record<SupportType, number>;
  }) {
    this.total = init.total;
    this.byStatus = init.byStatus;
    this.byType = init.byType;
    this.active = init.byStatus[SupportStatus.ACTIVE];
  }
}
