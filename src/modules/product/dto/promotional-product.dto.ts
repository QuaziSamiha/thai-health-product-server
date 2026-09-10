import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { ProductType, StockStatus } from '../../../generated/prisma/browser';
import { toAbsoluteUrl, toPrice } from './product-shared.dto';

//* HOW MANY PRODUCTS MAY CARRY isPromotional = true AT ONCE — THE HOME PAGE
//* RENDERS EXACTLY TWO PROMOTIONAL CARDS SIDE BY SIDE.
export const MAX_PROMOTIONAL_PRODUCTS = 2;

//* THE WHOLE BODY OF THE ADD / REPLACE PROMOTIONAL-PRODUCT COMMANDS — ONE
//* REQUIRED FIELD NAMING THE PRODUCT THAT SHOULD TAKE THE SLOT.
export class PromotionalProductDto {
  @ApiProperty({
    description:
      'ID of the ACTIVE, non-promotional product that should take the promotional slot',
    example: 12,
  })
  @IsNotEmpty({ message: 'Please select a product' })
  @Type(() => Number)
  @IsInt({ message: 'Please select a valid product' })
  @Min(1, { message: 'Please select a valid product' })
  productId!: number;
}

//* ═══════════════════════════════════════════════════════════════════════
//* ADMIN SELECT OPTION — ONE ENTRY PER PRODUCT THAT CAN BE PROMOTED RIGHT
//* NOW: ACTIVE, NOT SOFT-DELETED, AND NOT ALREADY IN A PROMOTIONAL SLOT.
//* PRODUCT-LEVEL ONLY — isPromotional HERE IS Product.isPromotional, SO A
//* VARIABLE PRODUCT IS ONE OPTION, NOT ONE PER VARIANT.
//* ═══════════════════════════════════════════════════════════════════════
export class PromotionalProductOptionDto {
  @Expose()
  @ApiProperty({ description: 'Product ID', example: 12 })
  id!: number;

  @Expose()
  @ApiProperty({ description: 'Product name', example: 'Royal Jelly' })
  name!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai product name', example: 'นมผึ้ง' })
  nameTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'SKU, if set', example: 'THP-RJ-01' })
  sku?: string;

  @Expose()
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' })
  type!: ProductType;

  @Expose()
  @ApiProperty({ enum: StockStatus, enumName: 'StockStatus' })
  stockStatus!: StockStatus;

  @Expose()
  @ApiProperty({ description: 'List price', example: 250, type: 'number' })
  basePrice!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Final discounted price',
    example: 225,
    type: 'number',
  })
  salePrice?: number;

  @Expose()
  @ApiPropertyOptional({
    description: "Absolute URL of the product's primary image",
    example: 'http://localhost:8000/uploads/products/gallery/abc.webp',
  })
  image?: string;

  constructor(
    product: {
      id: number;
      name: string;
      nameTh: string | null;
      sku: string | null;
      type: ProductType;
      stockStatus: StockStatus;
      basePrice: unknown;
      salePrice: unknown;
      images?: { url: string }[];
    },
    baseUrl?: string,
  ) {
    this.id = product.id;
    this.name = product.name;
    this.nameTh = product.nameTh ?? undefined;
    this.sku = product.sku ?? undefined;
    this.type = product.type;
    this.stockStatus = product.stockStatus;
    this.basePrice = Number(product.basePrice);
    this.salePrice = toPrice(product.salePrice);
    this.image = toAbsoluteUrl(product.images?.[0]?.url, baseUrl);
  }
}
