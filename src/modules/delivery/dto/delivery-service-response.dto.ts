import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { DeliveryEntityStatus } from '../../../generated/prisma/enums';

//* ONE ROW IN THE Set Up > External Delivery Service ADMIN TABLE — A
//* DeliveryZone FLATTENED TOGETHER WITH ITS OWNING DeliveryProvider'S
//* DISPLAY FIELDS. SEE delivery.select.ts (DELIVERY_ZONE_ROW_SELECT) FOR THE
//* QUERY SHAPE THIS IS BUILT FROM.
export class DeliveryServiceRowDto {
  @Expose()
  @ApiProperty({
    description: "Public identifier of the zone (this table row's own sid).",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Internal numeric ID of the zone — used for update/delete routes.',
    example: 12,
  })
  id!: number;

  @Expose()
  @ApiProperty({
    description: "Public identifier of the zone's owning provider.",
    example: '660e8400-e29b-41d4-a716-446655440000',
  })
  providerSid!: string;

  @Expose()
  @ApiProperty({ description: '"Company Name" column.', example: 'KEX Express' })
  companyName!: string;

  @Expose()
  @ApiProperty({ description: '"Number" column.', example: '+66 2 123 4567' })
  phone!: string;

  @Expose()
  @ApiPropertyOptional({
    description: '"Location" column — the provider\'s own office/hub address.',
    example: 'Bangkok, Thailand',
  })
  officeLocation?: string;

  @Expose()
  @ApiProperty({
    description: '"Delivery Area" column.',
    example: 'Bangkok, Thailand',
  })
  areaName!: string;

  @Expose()
  @ApiProperty({
    description: '"Delivery Time" column, pre-formatted for display.',
    example: '3-7 days',
  })
  deliveryTime!: string;

  @Expose()
  @ApiProperty({ description: 'Fastest-case delivery time, in days.', example: 3 })
  minDeliveryDays!: number;

  @Expose()
  @ApiProperty({ description: 'Slowest-case delivery time, in days.', example: 7 })
  maxDeliveryDays!: number;

  @Expose()
  @ApiProperty({ description: 'Flat delivery charge for this area/tier.', example: 60.0 })
  baseFee!: number;

  @Expose()
  @ApiProperty({ description: 'Whether Cash-on-Delivery is available.', example: true })
  codAvailable!: boolean;

  @Expose()
  @ApiProperty({
    enum: DeliveryEntityStatus,
    description: 'Lifecycle status of this zone.',
    example: DeliveryEntityStatus.ACTIVE,
  })
  status!: DeliveryEntityStatus;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when this row was created.' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update.' })
  updatedAt!: Date;

  constructor(row: {
    id: number;
    sid: string;
    areaName: string;
    minDeliveryDays: number;
    maxDeliveryDays: number;
    baseFee: unknown;
    codAvailable: boolean;
    status: DeliveryEntityStatus;
    createdAt: Date;
    updatedAt: Date;
    provider: {
      sid: string;
      name: string;
      phone: string;
      officeLocation: string | null;
    };
  }) {
    this.id = row.id;
    this.sid = row.sid;
    this.providerSid = row.provider.sid;
    this.companyName = row.provider.name;
    this.phone = row.provider.phone;
    this.officeLocation = row.provider.officeLocation ?? undefined;
    this.areaName = row.areaName;
    this.minDeliveryDays = row.minDeliveryDays;
    this.maxDeliveryDays = row.maxDeliveryDays;
    //* "3-7 days" — OR A SINGLE NUMBER WHEN min === max, SEE docs/delivery.md's
    //* "Delivery-Time Rendering" NOTE. NEVER STORED AS A STRING, ONLY RENDERED HERE.
    this.deliveryTime =
      row.minDeliveryDays === row.maxDeliveryDays
        ? `${row.minDeliveryDays} days`
        : `${row.minDeliveryDays}-${row.maxDeliveryDays} days`;
    this.baseFee = Number(row.baseFee);
    this.codAvailable = row.codAvailable;
    this.status = row.status;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
  }
}
