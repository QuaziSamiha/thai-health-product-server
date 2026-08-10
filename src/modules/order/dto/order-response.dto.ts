import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  AddressType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from '../../../generated/prisma/enums';

export class OrderItemResponseDto {
  @Expose()
  @ApiProperty({ description: 'Order item ID', example: 1 })
  id!: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Product ID (null for a combo line)' })
  productId?: number | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Variant ID, if this line pinned one' })
  variantId?: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Combo product ID (null for a product/variant line)',
  })
  comboId?: number | null;

  @Expose()
  @ApiProperty({
    description: 'Product/variant/combo name, frozen at order time',
  })
  name!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai name, frozen at order time' })
  nameTh?: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'SKU, frozen at order time' })
  sku?: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Image URL, frozen at order time' })
  imageUrl?: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Variant attributes at order time, e.g. { "size": "30ml" }',
  })
  attributes?: Record<string, unknown> | null;

  @Expose()
  @ApiProperty({ description: 'Quantity purchased', example: 2 })
  quantity!: number;

  @Expose()
  @ApiProperty({ description: 'Price per unit at order time', example: 150 })
  unitPrice!: number;

  @Expose()
  @ApiProperty({
    description: 'Per-line share of any order-level discount',
    example: 0,
  })
  discountAmount!: number;

  @Expose()
  @ApiProperty({
    description: '(unitPrice * quantity) - discountAmount',
    example: 300,
  })
  totalPrice!: number;

  constructor(item: {
    id: number;
    productId: number | null;
    variantId: number | null;
    comboId: number | null;
    name: string;
    nameTh: string | null;
    sku: string | null;
    imageUrl: string | null;
    attributes: unknown;
    quantity: number;
    unitPrice: unknown;
    discountAmount: unknown;
    totalPrice: unknown;
  }) {
    this.id = item.id;
    this.productId = item.productId;
    this.variantId = item.variantId;
    this.comboId = item.comboId;
    this.name = item.name;
    this.nameTh = item.nameTh;
    this.sku = item.sku;
    this.imageUrl = item.imageUrl;
    this.attributes =
      (item.attributes as Record<string, unknown> | null) ?? null;
    this.quantity = item.quantity;
    this.unitPrice = Number(item.unitPrice);
    this.discountAmount = Number(item.discountAmount);
    this.totalPrice = Number(item.totalPrice);
  }
}

export class OrderAddressResponseDto {
  @Expose()
  @ApiProperty({ enum: AddressType })
  type!: AddressType;

  @Expose()
  @ApiProperty({ description: 'Recipient name' })
  recipientName!: string;

  @Expose()
  @ApiProperty({ description: 'Contact phone' })
  phone!: string;

  @Expose()
  @ApiProperty({ description: 'Street name and house/unit number' })
  addressLine!: string;

  @Expose()
  @ApiProperty({ description: 'Province level' })
  state!: string;

  @Expose()
  @ApiProperty({ description: 'District level' })
  region!: string;

  @Expose()
  @ApiProperty({ description: 'Postal/ZIP code' })
  postalCode!: string;

  @Expose()
  @ApiProperty({ description: 'Country name' })
  country!: string;

  constructor(address: {
    type: AddressType;
    recipientName: string;
    phone: string;
    addressLine: string;
    state: string;
    region: string;
    postalCode: string;
    country: string;
  }) {
    this.type = address.type;
    this.recipientName = address.recipientName;
    this.phone = address.phone;
    this.addressLine = address.addressLine;
    this.state = address.state;
    this.region = address.region;
    this.postalCode = address.postalCode;
    this.country = address.country;
  }
}

export class PaymentResponseDto {
  @Expose()
  @ApiProperty({ description: 'Payment record ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({ description: 'Public-facing UUID' })
  sid!: string;

  @Expose()
  @ApiProperty({ enum: PaymentTransactionType })
  type!: PaymentTransactionType;

  @Expose()
  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;

  @Expose()
  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;

  @Expose()
  @ApiProperty({ description: 'Amount for this payment record', example: 355 })
  amount!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Gateway provider name — null for Cash on Delivery',
  })
  provider?: string | null;

  @Expose()
  @ApiPropertyOptional({ description: "Gateway's own transaction reference" })
  transactionId?: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'When this payment was confirmed paid' })
  paidAt?: Date | null;

  @Expose()
  @ApiProperty({ description: 'When this payment record was created' })
  createdAt!: Date;

  constructor(payment: {
    id: number;
    sid: string;
    type: PaymentTransactionType;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: unknown;
    provider: string | null;
    transactionId: string | null;
    paidAt: Date | null;
    createdAt: Date;
  }) {
    this.id = payment.id;
    this.sid = payment.sid;
    this.type = payment.type;
    this.method = payment.method;
    this.status = payment.status;
    this.amount = Number(payment.amount);
    this.provider = payment.provider;
    this.transactionId = payment.transactionId;
    this.paidAt = payment.paidAt;
    this.createdAt = payment.createdAt;
  }
}

export class OrderStatusHistoryResponseDto {
  @Expose()
  @ApiProperty({ description: 'History row ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @Expose()
  @ApiPropertyOptional({ description: 'Reason/note for this transition' })
  note?: string | null;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Display name of the staff member who made this change — null for a system/automated transition',
  })
  changedByName?: string | null;

  @Expose()
  @ApiProperty({ description: 'When this transition happened' })
  createdAt!: Date;

  constructor(history: {
    id: number;
    status: OrderStatus;
    note: string | null;
    createdAt: Date;
    changedByUser?: {
      email: string;
      profile?: { name: string | null } | null;
    } | null;
  }) {
    this.id = history.id;
    this.status = history.status;
    this.note = history.note;
    this.changedByName =
      history.changedByUser?.profile?.name ??
      history.changedByUser?.email ??
      null;
    this.createdAt = history.createdAt;
  }
}

export class OrderResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({ description: 'Public-facing UUID' })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Human-readable order number',
    example: 'THP-260810-000001',
  })
  orderNumber!: string;

  @Expose()
  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @Expose()
  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @Expose()
  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @Expose()
  @ApiProperty({ description: 'Customer first name' })
  customerFirstName!: string;

  @Expose()
  @ApiProperty({ description: 'Customer last name' })
  customerLastName!: string;

  @Expose()
  @ApiProperty({ description: 'Customer email' })
  customerEmail!: string;

  @Expose()
  @ApiProperty({ description: 'Customer phone' })
  customerPhone!: string;

  @Expose()
  @ApiProperty({
    description: 'Sum of item totals before order-level discount',
    example: 300,
  })
  subtotal!: number;

  @Expose()
  @ApiProperty({
    description: 'Promo code discount applied to this order, if any',
    example: 0,
  })
  discountAmount!: number;

  @Expose()
  @ApiProperty({ description: 'Delivery charge', example: 50 })
  deliveryCharge!: number;

  @Expose()
  @ApiProperty({ description: 'Tax amount — always 0 in v1', example: 0 })
  taxAmount!: number;

  @Expose()
  @ApiProperty({
    description: 'subtotal - discountAmount + deliveryCharge + taxAmount',
    example: 350,
  })
  totalAmount!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Promo code applied to this order, if any',
  })
  appliedPromoCode?: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Optional note left by the customer at checkout',
  })
  customerNote?: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Reason recorded when this order was cancelled',
  })
  cancelReason?: string | null;

  @Expose()
  @ApiProperty({ description: 'When the order was placed' })
  placedAt!: Date;

  @Expose()
  @ApiPropertyOptional()
  confirmedAt?: Date | null;

  @Expose()
  @ApiPropertyOptional()
  shippedAt?: Date | null;

  @Expose()
  @ApiPropertyOptional()
  deliveredAt?: Date | null;

  @Expose()
  @ApiPropertyOptional()
  cancelledAt?: Date | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Owning user — null for a guest checkout',
  })
  userId?: number | null;

  @Expose()
  @ApiProperty({ type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @Expose()
  @ApiProperty({ type: [OrderAddressResponseDto] })
  addresses!: OrderAddressResponseDto[];

  @Expose()
  @ApiProperty({ type: [PaymentResponseDto] })
  payments!: PaymentResponseDto[];

  @Expose()
  @ApiPropertyOptional({
    type: [OrderStatusHistoryResponseDto],
    description: 'Only present on the admin detail endpoint',
  })
  statusHistory?: OrderStatusHistoryResponseDto[];

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;

  constructor(order: {
    id: number;
    sid: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    customerFirstName: string;
    customerLastName: string;
    customerEmail: string;
    customerPhone: string;
    subtotal: unknown;
    discountAmount: unknown;
    deliveryCharge: unknown;
    taxAmount: unknown;
    totalAmount: unknown;
    appliedPromoCode: string | null;
    customerNote: string | null;
    cancelReason: string | null;
    placedAt: Date;
    confirmedAt: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
    userId: number | null;
    items: ConstructorParameters<typeof OrderItemResponseDto>[0][];
    addresses: ConstructorParameters<typeof OrderAddressResponseDto>[0][];
    payments: ConstructorParameters<typeof PaymentResponseDto>[0][];
    statusHistory?: ConstructorParameters<
      typeof OrderStatusHistoryResponseDto
    >[0][];
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = order.id;
    this.sid = order.sid;
    this.orderNumber = order.orderNumber;
    this.status = order.status;
    this.paymentStatus = order.paymentStatus;
    this.paymentMethod = order.paymentMethod;
    this.customerFirstName = order.customerFirstName;
    this.customerLastName = order.customerLastName;
    this.customerEmail = order.customerEmail;
    this.customerPhone = order.customerPhone;
    this.subtotal = Number(order.subtotal);
    this.discountAmount = Number(order.discountAmount);
    this.deliveryCharge = Number(order.deliveryCharge);
    this.taxAmount = Number(order.taxAmount);
    this.totalAmount = Number(order.totalAmount);
    this.appliedPromoCode = order.appliedPromoCode;
    this.customerNote = order.customerNote;
    this.cancelReason = order.cancelReason;
    this.placedAt = order.placedAt;
    this.confirmedAt = order.confirmedAt;
    this.shippedAt = order.shippedAt;
    this.deliveredAt = order.deliveredAt;
    this.cancelledAt = order.cancelledAt;
    this.userId = order.userId;
    this.items = order.items.map((item) => new OrderItemResponseDto(item));
    this.addresses = order.addresses.map(
      (address) => new OrderAddressResponseDto(address),
    );
    this.payments = order.payments.map(
      (payment) => new PaymentResponseDto(payment),
    );
    this.statusHistory = order.statusHistory?.map(
      (history) => new OrderStatusHistoryResponseDto(history),
    );
    this.createdAt = order.createdAt;
    this.updatedAt = order.updatedAt;
  }
}
