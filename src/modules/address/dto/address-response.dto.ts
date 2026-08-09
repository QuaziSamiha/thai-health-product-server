import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { AddressType } from '../../../generated/prisma/enums';
import { AddressModel } from '../../../generated/prisma/models';

export class AddressResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID, safe to expose in URLs and API responses',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'User-facing nickname for this address',
    example: 'Home',
  })
  label?: string;

  @Expose()
  @ApiProperty({
    enum: AddressType,
    description: 'Address type — shipping-only in v1',
    example: AddressType.SHIPPING,
  })
  type!: AddressType;

  @Expose()
  @ApiProperty({
    description: 'Whether this is the default delivery address',
    example: false,
  })
  isDefault!: boolean;

  @Expose()
  @ApiProperty({
    description: 'Full name of the person receiving the delivery',
    example: 'Somchai Jaidee',
  })
  recipientName!: string;

  @Expose()
  @ApiProperty({ description: 'Contact phone number', example: '+66812345678' })
  phone!: string;

  @Expose()
  @ApiProperty({
    description: 'Street name and house/unit number',
    example: '123/45 Sukhumvit Road',
  })
  addressLine!: string;

  @Expose()
  @ApiProperty({ description: 'Province level', example: 'Bangkok' })
  state!: string;

  @Expose()
  @ApiProperty({ description: 'District level', example: 'Watthana' })
  region!: string;

  @Expose()
  @ApiProperty({ description: 'Postal/ZIP code', example: '10110' })
  postalCode!: string;

  @Expose()
  @ApiProperty({ description: 'Country name', example: 'Thailand' })
  country!: string;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  constructor(address: Partial<AddressModel>) {
    this.id = address.id!;
    this.sid = address.sid!;
    this.label = address.label ?? undefined;
    this.type = address.type!;
    this.isDefault = address.isDefault!;
    this.recipientName = address.recipientName!;
    this.phone = address.phone!;
    this.addressLine = address.addressLine!;
    this.state = address.state!;
    this.region = address.region!;
    this.postalCode = address.postalCode!;
    this.country = address.country!;
    this.createdAt = address.createdAt!;
    this.updatedAt = address.updatedAt!;
  }
}
