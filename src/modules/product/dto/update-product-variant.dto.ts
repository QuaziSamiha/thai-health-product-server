import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductVariantDto } from './create-product-variant.dto';

//* SAME SHAPE AS THE CREATE VARIANT DTO PLUS AN OPTIONAL `id` — THE PRESENCE
//* OF `id` IS WHAT DECIDES WHETHER AN ENTRY UPDATES AN EXISTING VARIANT OR
//* CREATES A NEW ONE DURING A PRODUCT UPDATE.
export class UpdateProductVariantDto extends CreateProductVariantDto {
  @ApiPropertyOptional({
    description:
      'ID of an existing variant of this product to update in place. Omit to create a new variant instead.',
    example: 12,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Variant ID must be a whole number' })
  @Min(1, { message: 'Variant ID must be a valid positive integer' })
  id?: number;
}
