import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { OrderItemDto } from './create-order.dto';

//* WHY THIS ENDPOINT EXISTS AT ALL: ProductResponsePublicDto DELIBERATELY
//* WITHHOLDS THE EXACT quantity/totalStock COUNTS SO INVENTORY LEVELS DON'T
//* LEAK TO SCRAPERS (SEE product-response.dto.ts). THE STOREFRONT CART
//* THEREFORE CANNOT COMPARE "IN CART" AGAINST "IN STOCK" ON ITS OWN. IT POSTS
//* THE CART HERE INSTEAD AND GETS BACK A VERDICT PER LINE — `available` IS
//* ONLY EVER FILLED IN FOR A LINE THE CUSTOMER IS ALREADY HOLDING, WHICH
//* KEEPS THE CATALOG UNBROWSABLE WHILE STILL LETTING THE CART SELF-CORRECT.
export enum CartLineStatus {
  OK = 'OK',
  //* THE LINE IS STILL BUYABLE, JUST NOT AT THE REQUESTED COUNT — `available`
  //* IS THE CEILING THE CLIENT SHOULD CLAMP TO.
  QUANTITY_REDUCED = 'QUANTITY_REDUCED',
  //* BUYABLE IN PRINCIPLE, NOTHING LEFT RIGHT NOW (available = 0).
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  //* DELETED, UNPUBLISHED, OR RETIRED — RESTOCKING WON'T BRING IT BACK, SO
  //* THE ONLY FIX IS REMOVING THE LINE.
  UNAVAILABLE = 'UNAVAILABLE',
}
//* NOTE THERE IS NO PRICE_CHANGED MEMBER: OrderItemDto CARRIES NO PRICE, SO
//* THE SERVER HAS NOTHING TO COMPARE AGAINST. EVERY LINE RETURNS ITS LIVE
//* `unitPrice` INSTEAD AND THE CLIENT DIFFS THAT AGAINST ITS OWN CACHED
//* SNAPSHOT — WHICH IS PURELY COSMETIC ANYWAY, SINCE placeOrder PRICES
//* SERVER-SIDE REGARDLESS OF WHAT THE CART BELIEVES.

export class ValidateCartDto {
  @ApiProperty({
    description:
      'The cart lines to check — same shape as CreateOrderDto.items, so the client can post exactly what it would place.',
    type: [OrderItemDto],
  })
  @IsArray({ message: 'Items must be an array' })
  @ArrayMinSize(1, { message: 'At least one item is required' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

export class CartLineValidationDto {
  @ApiPropertyOptional({
    description: 'Product ID, when the line is a product',
  })
  productId?: number;

  @ApiPropertyOptional({ description: 'Variant ID, when the line pins one' })
  variantId?: number;

  @ApiPropertyOptional({ description: 'Combo ID, when the line is a bundle' })
  comboId?: number;

  @ApiProperty({ description: 'Display name as the catalog currently has it' })
  name!: string;

  @ApiProperty({ description: 'Quantity the client asked about' })
  requested!: number;

  @ApiProperty({
    description:
      "How many of this line can actually be bought right now. 0 when out of stock or unavailable. For a combo this is the assemblable bundle count capped by the admin's offered quantity, not raw component stock.",
  })
  available!: number;

  @ApiProperty({ enum: CartLineStatus, description: 'Verdict for this line' })
  status!: CartLineStatus;

  @ApiProperty({
    description:
      'Current unit price (sale price for a product/variant, combo price for a bundle) so a stale cart snapshot can be refreshed.',
  })
  unitPrice!: number;

  @ApiProperty({
    description: 'Customer-facing explanation, ready to render as-is',
  })
  message!: string;
}

export class ValidateCartResponseDto {
  @ApiProperty({
    description:
      'True only when every line is OK. Advisory, not a reservation — stock can still move between this call and placement.',
  })
  valid!: boolean;

  @ApiProperty({
    description: 'One entry per submitted line, in the order submitted',
    type: [CartLineValidationDto],
  })
  lines!: CartLineValidationDto[];
}
