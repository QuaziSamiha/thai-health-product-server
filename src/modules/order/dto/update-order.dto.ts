import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { OrderStatus, PaymentStatus } from '../../../generated/prisma/enums';
import {
  emptyStringToUndefined,
  trimString,
} from '../../../common/utils/json-transform.util';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    enum: OrderStatus,
    example: OrderStatus.CONFIRMED,
  })
  @IsEnum(OrderStatus, { message: 'Invalid order status' })
  status!: OrderStatus;

  @ApiPropertyOptional({
    description: 'Reason — required when status is CANCELLED',
    example: 'Customer requested cancellation',
  })
  @ValidateIf(
    (dto: UpdateOrderStatusDto) => dto.status === OrderStatus.CANCELLED,
  )
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'cancelReason is required when cancelling an order' })
  @IsString({ message: 'cancelReason must be a valid text string' })
  @MaxLength(500, { message: 'cancelReason cannot exceed 500 characters' })
  cancelReason?: string;

  @ApiPropertyOptional({
    description: 'Optional note recorded in the status history',
    example: 'Confirmed by phone',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Note must be a valid text string' })
  @MaxLength(1000, { message: 'Note cannot exceed 1000 characters' })
  note?: string;
}

export class UpdatePaymentStatusDto {
  @ApiProperty({
    description: 'New payment status',
    enum: PaymentStatus,
    example: PaymentStatus.PAID,
  })
  @IsEnum(PaymentStatus, { message: 'Invalid payment status' })
  paymentStatus!: PaymentStatus;

  @ApiPropertyOptional({
    description: 'Optional note recorded in the status history',
    example: 'Cash collected on delivery',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Note must be a valid text string' })
  @MaxLength(1000, { message: 'Note cannot exceed 1000 characters' })
  note?: string;
}
