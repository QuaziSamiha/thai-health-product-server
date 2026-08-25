import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../../generated/prisma/enums';

//* ORDERS THAT NEVER EARNED ANYTHING. EXCLUDED FROM EVERY REVENUE NUMBER —
//* SAME EXCLUSION DeliveryChargeRepository.hasPreviousOrders APPLIES, FOR
//* THE SAME REASON. RETURNED/REFUNDED ARE DELIBERATELY *NOT* HERE: THOSE
//* ORDERS DID TAKE MONEY, AND THEIR SLICE STAYS VISIBLE IN `byStatus`.
export const NON_EARNING_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.FAILED,
];

//* ORDERS STILL WAITING ON THE WAREHOUSE — THE "NEEDS ATTENTION" CARD.
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
];

//* ORDERS THAT HAVE LEFT THE BUILDING BUT HAVE NOT LANDED YET.
export const IN_TRANSIT_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
];

/** Money taken, over two windows. */
export class OrderRevenueDto {
  @Expose()
  @ApiProperty({
    description:
      'Sum of `totalAmount` over every order that is not CANCELLED or FAILED, for all time.',
    example: 1_284_500.75,
  })
  lifetime!: number;

  @Expose()
  @ApiProperty({
    description:
      'The same sum narrowed to orders placed within the trailing window (see `windowDays`).',
    example: 96_240.5,
  })
  window!: number;

  @Expose()
  @ApiProperty({
    description: 'Length of the `window` figure, in days.',
    example: 30,
  })
  windowDays!: number;

  @Expose()
  @ApiProperty({
    description:
      'Orders placed within the window — **all** of them, cancelled and failed included, so it reads as order volume rather than as a denominator for `window`.',
    example: 312,
  })
  windowOrders!: number;

  @Expose()
  @ApiProperty({
    description:
      'Lifetime revenue divided by the orders that produced it, rounded to two decimals. `0` when nothing has sold yet.',
    example: 812.35,
  })
  averageOrderValue!: number;

  constructor(init: {
    lifetime: number;
    window: number;
    windowDays: number;
    windowOrders: number;
    earningOrders: number;
  }) {
    this.lifetime = init.lifetime;
    this.window = init.window;
    this.windowDays = init.windowDays;
    this.windowOrders = init.windowOrders;
    //* GUARDED — A STORE WITH NO EARNING ORDERS YET WOULD OTHERWISE REPORT
    //* NaN, WHICH SERIALIZES TO `null` AND BREAKS THE CARD.
    this.averageOrderValue = init.earningOrders
      ? Math.round((init.lifetime / init.earningOrders) * 100) / 100
      : 0;
  }
}

/** The Order module's contribution to the admin dashboard overview. */
export class OrderStatsDto {
  @Expose()
  @ApiProperty({ description: 'Every order ever placed', example: 4_218 })
  total!: number;

  @Expose()
  @ApiProperty({
    description: 'Count per `OrderStatus`, zero-filled across the whole enum.',
    example: {
      PENDING: 24,
      CONFIRMED: 11,
      PROCESSING: 8,
      PACKED: 5,
      SHIPPED: 19,
      OUT_FOR_DELIVERY: 7,
      DELIVERED: 4_012,
      CANCELLED: 108,
      RETURNED: 14,
      REFUNDED: 9,
      FAILED: 1,
    },
    additionalProperties: { type: 'number' },
  })
  byStatus!: Record<OrderStatus, number>;

  @Expose()
  @ApiProperty({
    description:
      'Count per `PaymentStatus`, zero-filled across the whole enum.',
    example: {
      PENDING: 31,
      AUTHORIZED: 6,
      PAID: 4_055,
      FAILED: 4,
      PARTIALLY_REFUNDED: 3,
      REFUNDED: 9,
      CANCELLED: 110,
    },
    additionalProperties: { type: 'number' },
  })
  byPaymentStatus!: Record<PaymentStatus, number>;

  @Expose()
  @ApiProperty({
    description:
      'Count per `PaymentMethod`, zero-filled across the whole enum.',
    example: { CARD: 1_204, SCANPAY: 812, CASH_ON_DELIVERY: 2_202 },
    additionalProperties: { type: 'number' },
  })
  byPaymentMethod!: Record<PaymentMethod, number>;

  @Expose()
  @ApiProperty({
    description:
      'Orders the warehouse still owes work on — PENDING, CONFIRMED, PROCESSING or PACKED.',
    example: 48,
  })
  open!: number;

  @Expose()
  @ApiProperty({
    description: 'Orders dispatched but not yet delivered.',
    example: 26,
  })
  inTransit!: number;

  @Expose()
  @ApiProperty({
    description: 'Orders that reached the customer.',
    example: 4_012,
  })
  delivered!: number;

  @Expose()
  @ApiProperty({
    description: 'Orders cancelled before they shipped.',
    example: 108,
  })
  cancelled!: number;

  @Expose()
  @ApiProperty({ type: OrderRevenueDto, description: 'Money taken' })
  revenue!: OrderRevenueDto;

  constructor(init: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    byPaymentStatus: Record<PaymentStatus, number>;
    byPaymentMethod: Record<PaymentMethod, number>;
    open: number;
    inTransit: number;
    revenue: OrderRevenueDto;
  }) {
    this.total = init.total;
    this.byStatus = init.byStatus;
    this.byPaymentStatus = init.byPaymentStatus;
    this.byPaymentMethod = init.byPaymentMethod;
    this.open = init.open;
    this.inTransit = init.inTransit;
    this.delivered = init.byStatus[OrderStatus.DELIVERED];
    this.cancelled = init.byStatus[OrderStatus.CANCELLED];
    this.revenue = init.revenue;
  }
}
