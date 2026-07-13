import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

//* ONE ROW OF THE items ARRAY ON CreateComboProductDto/UpdateComboProductDto —
//* MIRRORS ComboItem (combo-product.prisma). @Type(() => Number) IS REQUIRED
//* HERE BECAUSE THE PARENT DTO PARSES items OUT OF A JSON STRING WHEN THE
//* REQUEST ARRIVES AS multipart/form-data, WHERE EVERY LEAF VALUE IS A STRING.
export class ComboItemDto {
  @ApiProperty({
    description: 'ID of the product to bundle into the combo.',
    example: 12,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Product ID must be a whole number' })
  @Min(1, { message: 'Product ID must be a valid positive integer' })
  productId!: number;

  @ApiPropertyOptional({
    description:
      'Optional variant ID to pin this item to a specific size/variant. Omit to bundle the product generically.',
    example: 104,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Variant ID must be a whole number' })
  @Min(1, { message: 'Variant ID must be a valid positive integer' })
  variantId?: number;

  @ApiPropertyOptional({
    description: 'How many units of this product/variant per combo purchase.',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity?: number;

  @ApiPropertyOptional({
    description:
      'Snapshot of the unit price at bundling time, so later price changes on the product/variant do not retroactively change historical combo pricing.',
    example: 450.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Unit price must be a valid number' })
  @Min(0, { message: 'Unit price cannot be negative' })
  unitPrice?: number;

  @ApiPropertyOptional({
    description: 'Manual sort position within the combo item list.',
    example: 0,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Display order must be a whole number' })
  @Min(0, { message: 'Display order cannot be negative' })
  displayOrder?: number;
}
