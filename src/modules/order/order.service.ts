import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/prisma/client';
import {
  AddressType,
  CategoryProductStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from '../../generated/prisma/enums';
import { OrderRepository } from './order.repository';
import { AddressService } from '../address/address.service';
import { CreateAddressDto } from '../address/dto/create-address.dto';
import { InventoryService } from '../inventory/inventory.service';
import { PromotionService } from '../promotion/promotion.service';
import { IPaginatedResult, PaginationQueryDto } from '../../shared/pagination';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import {
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
} from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';

//* v1 FLAT DELIVERY RATE — NO DELIVERY-PRICING MODULE YET (SEE docs/order.md).
//* SWAP FOR A REAL RULE ENGINE LATER; totalAmount'S FORMULA DOESN'T CHANGE.
const FLAT_DELIVERY_CHARGE = 50;

type ResolvedAddress = {
  recipientName: string;
  phone: string;
  addressLine: string;
  state: string;
  region: string;
  postalCode: string;
  country: string;
  sourceAddressId: number | null;
};

type StockDeductionLine = {
  productId?: number;
  variantId?: number;
  quantity: number;
};

interface OrderItemInsert {
  productId: number | null;
  variantId: number | null;
  comboId: number | null;
  name: string;
  nameTh: string | null;
  sku: string | null;
  imageUrl: string | null;
  attributes?: Prisma.InputJsonValue;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
}

//* status → THE SET OF STATUSES IT MAY LEGALLY MOVE TO NEXT. ANYTHING NOT
//* LISTED AS A SOURCE IS TERMINAL. GENERALIZES NATURA'S ONE-OFF GUARD
//* (CONFIRMED/CANCELLED CAN'T GO BACK TO PENDING) INTO A FULL TABLE SINCE
//* THP's OrderStatus HAS MORE INTERMEDIATE STOPS.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED, OrderStatus.FAILED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  PACKED: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
  DELIVERED: [OrderStatus.RETURNED],
  CANCELLED: [],
  RETURNED: [OrderStatus.REFUNDED],
  REFUNDED: [],
  FAILED: [],
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly addressService: AddressService,
    private readonly inventoryService: InventoryService,
    private readonly promotionService: PromotionService,
  ) {}

  // ─── Place Order ──────────────────────────────────────────────────────────

  async placeOrder(
    dto: CreateOrderDto,
    userId: number | undefined,
  ): Promise<OrderResponseDto> {
    const address = await this.resolveAddress(dto, userId);
    const aggregatedItems = this.aggregateItems(dto.items);

    const order = await this.orderRepository.withTransaction(async (tx) => {
      const { orderItems, stockDeductions, subtotal } =
        await this.buildOrderItems(aggregatedItems, tx);

      const deliveryCharge = FLAT_DELIVERY_CHARGE;
      const taxAmount = 0; //* NO VAT RULES DEFINED YET

      //* PROMO CODE — VALIDATED + RESERVED (GUARDED usedCount BUMP) INSIDE
      //* THIS SAME TRANSACTION, MIRRORING deductStockForSale'S "CLAIM NOW,
      //* ROLL BACK ON FAILURE" SHAPE. THE DISCOUNT IS THEN SPLIT ACROSS
      //* orderItems SO EACH LINE'S OWN discountAmount/totalPrice REFLECTS
      //* ITS SHARE — SEE OrderItem's discountAmount CONTRACT (order.prisma).
      let discountAmount = 0;
      let appliedPromoCode: string | null = null;
      let reservedPromoCodeId: number | null = null;
      if (dto.promoCode) {
        const reservation =
          await this.promotionService.validateAndReserveForOrder(
            dto.promoCode,
            subtotal,
            userId,
            dto.email,
            tx,
          );
        discountAmount = reservation.discountAmount;
        appliedPromoCode = dto.promoCode;
        reservedPromoCodeId = reservation.promoCodeId;
        this.allocateDiscountAcrossItems(orderItems, discountAmount, subtotal);
      }

      const totalAmount = round2(
        subtotal - discountAmount + deliveryCharge + taxAmount,
      );

      if (totalAmount <= 0) {
        throw new BadRequestException('Order total must be greater than zero');
      }

      const shell = await this.orderRepository.createOrderShell(
        {
          //* PLACEHOLDER — REPLACED BELOW ONCE THE ROW'S OWN id IS KNOWN, SAME
          //* TWO-STEP DANCE AS InventoryService.createBatchWithGeneratedNumber
          orderNumber: `PENDING-${randomUUID()}`,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: dto.paymentMethod,
          customerFirstName: dto.firstName,
          customerLastName: dto.lastName,
          customerEmail: dto.email,
          customerPhone: dto.phone,
          subtotal,
          discountAmount,
          deliveryCharge,
          taxAmount,
          totalAmount,
          appliedPromoCode,
          customerNote: dto.customerNote,
          userId: userId ?? null,
        },
        tx,
      );

      await this.orderRepository.finalizeOrderNumber(
        shell.id,
        this.generateOrderNumber(shell.id),
        tx,
      );

      if (reservedPromoCodeId) {
        await this.promotionService.recordRedemption(
          reservedPromoCodeId,
          userId,
          shell.id,
          discountAmount,
          tx,
        );
      }

      await this.orderRepository.createOrderAddress(
        {
          orderId: shell.id,
          type: AddressType.SHIPPING,
          recipientName: address.recipientName,
          phone: address.phone,
          addressLine: address.addressLine,
          state: address.state,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
          sourceAddressId: address.sourceAddressId,
        },
        tx,
      );

      await this.orderRepository.createOrderItems(
        orderItems.map((item) => ({ ...item, orderId: shell.id })),
        tx,
      );

      //* REUSES InventoryModule's OWN STOCK-DECREMENT + LEDGER LOGIC RATHER
      //* THAN RE-IMPLEMENTING IT HERE — SEE InventoryService.deductStockForSale.
      await this.inventoryService.deductStockForSale(
        stockDeductions,
        `order:${shell.id}`,
        userId,
        tx,
      );

      await this.orderRepository.createStatusHistory(
        {
          orderId: shell.id,
          status: OrderStatus.PENDING,
          note: 'Order placed',
        },
        tx,
      );

      await this.orderRepository.createPayment(
        {
          orderId: shell.id,
          type: PaymentTransactionType.CHARGE,
          method: dto.paymentMethod,
          status: PaymentStatus.PENDING,
          amount: totalAmount,
        },
        tx,
      );

      return this.orderRepository.findOrderDetail(shell.id, false, tx);
    });

    return new OrderResponseDto(order!);
  }

  /**
   * Resolves the checkout address into one flat shape, ready to snapshot
   * into OrderAddress. Logged-in customers may reference a saved address
   * (ownership-checked by AddressService) or supply a new one, which is
   * saved to their address book as a side effect — via AddressService's own
   * public createAddress, which opens its own transaction rather than
   * joining this order's, so the address is saved even if order placement
   * later fails validation. That's a deliberate trade-off: a saved address
   * is a reusable asset independent of any one order's outcome, and
   * AddressModule (already shipped) doesn't expose a tx-aware variant.
   * Guests never touch the address book at all — newAddress is used inline.
   */
  private async resolveAddress(
    dto: CreateOrderDto,
    userId: number | undefined,
  ): Promise<ResolvedAddress> {
    const fallbackRecipientName = `${dto.firstName} ${dto.lastName}`.trim();

    if (userId) {
      if (dto.addressId) {
        const saved = await this.addressService.getAddressById(
          userId,
          dto.addressId,
        );
        return {
          recipientName: saved.recipientName,
          phone: saved.phone,
          addressLine: saved.addressLine,
          state: saved.state,
          region: saved.region,
          postalCode: saved.postalCode,
          country: saved.country,
          sourceAddressId: saved.id,
        };
      }

      //* dto.newAddress IS GUARANTEED PRESENT HERE — AddressSourceConstraint
      //* ON CreateOrderDto ALREADY ENFORCED EXACTLY ONE OF addressId/newAddress.
      const newAddress = dto.newAddress!;
      const payload: CreateAddressDto = {
        label: newAddress.label,
        recipientName: newAddress.recipientName ?? fallbackRecipientName,
        phone: newAddress.phone ?? dto.phone,
        addressLine: newAddress.addressLine,
        state: newAddress.state,
        region: newAddress.region,
        postalCode: newAddress.postalCode,
        country: newAddress.country,
      };
      const saved = await this.addressService.createAddress(userId, payload);
      return {
        recipientName: saved.recipientName,
        phone: saved.phone,
        addressLine: saved.addressLine,
        state: saved.state,
        region: saved.region,
        postalCode: saved.postalCode,
        country: saved.country,
        sourceAddressId: saved.id,
      };
    }

    //* GUEST CHECKOUT — NO ADDRESS BOOK, newAddress USED INLINE ONLY.
    if (dto.addressId) {
      throw new BadRequestException(
        'Guests cannot use a saved address — provide newAddress instead',
      );
    }
    if (!dto.newAddress) {
      throw new BadRequestException('An address is required');
    }
    const newAddress = dto.newAddress;
    return {
      recipientName: newAddress.recipientName ?? fallbackRecipientName,
      phone: newAddress.phone ?? dto.phone,
      addressLine: newAddress.addressLine,
      state: newAddress.state,
      region: newAddress.region,
      postalCode: newAddress.postalCode,
      country: newAddress.country ?? 'Thailand',
      sourceAddressId: null,
    };
  }

  /** Merges duplicate lines (same product/variant/combo) so a client double-submit is validated/charged once, not twice. */
  private aggregateItems(items: OrderItemDto[]): OrderItemDto[] {
    const merged = new Map<string, OrderItemDto>();
    for (const item of items) {
      const key = item.comboId
        ? `combo-${item.comboId}`
        : `product-${item.productId}-variant-${item.variantId ?? ''}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        merged.set(key, { ...item });
      }
    }
    return Array.from(merged.values());
  }

  /**
   * Validates every line against live stock/status and builds both the
   * OrderItem snapshot rows and the merged stock-deduction plan. A combo
   * line expands into its underlying products/variants (ComboItem.quantity
   * × bundles purchased) rather than touching ComboProduct.quantity itself,
   * which is trigger-derived and recomputes on its own once the underlying
   * stock changes — same rule ComboProductService documents for itself.
   * Deductions are merged by product/variant key so a product bought both
   * directly and inside a combo in the same order is checked/decremented
   * as one combined amount.
   */
  private async buildOrderItems(
    items: OrderItemDto[],
    tx: Prisma.TransactionClient,
  ): Promise<{
    orderItems: OrderItemInsert[];
    stockDeductions: StockDeductionLine[];
    subtotal: number;
  }> {
    const orderItems: OrderItemInsert[] = [];
    const deductionMap = new Map<string, StockDeductionLine>();
    let subtotal = 0;

    const addDeduction = (line: StockDeductionLine) => {
      const key = line.variantId
        ? `variant-${line.variantId}`
        : `product-${line.productId}`;
      const existing = deductionMap.get(key);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        deductionMap.set(key, { ...line });
      }
    };

    for (const item of items) {
      if (item.comboId) {
        const combo = await this.orderRepository.findComboForOrder(
          item.comboId,
          tx,
        );
        if (!combo || combo.deletedAt) {
          throw new NotFoundException(`Combo ${item.comboId} not found`);
        }
        if (combo.status !== CategoryProductStatus.ACTIVE) {
          throw new BadRequestException(
            `"${combo.title}" is not currently available`,
          );
        }

        const sellable = Math.min(
          combo.quantity,
          combo.offeredQuantity ?? Infinity,
        );
        if (item.quantity > sellable) {
          throw new BadRequestException(
            sellable === 0
              ? `"${combo.title}" cannot be assembled right now — out of stock`
              : `Only ${sellable} of "${combo.title}" available right now, requested ${item.quantity}`,
          );
        }

        const unitPrice = Number(combo.comboPrice);
        const totalPrice = round2(unitPrice * item.quantity);
        subtotal += totalPrice;

        orderItems.push({
          productId: null,
          variantId: null,
          comboId: combo.id,
          name: combo.title,
          nameTh: combo.titleTh,
          sku: combo.sku,
          imageUrl: combo.images[0]?.url ?? null,
          quantity: item.quantity,
          unitPrice,
          discountAmount: 0,
          totalPrice,
        });

        for (const comboItem of combo.items) {
          addDeduction({
            productId: comboItem.variantId ? undefined : comboItem.productId,
            variantId: comboItem.variantId ?? undefined,
            quantity: comboItem.quantity * item.quantity,
          });
        }
        continue;
      }

      if (item.variantId) {
        const variant = await this.orderRepository.findVariantForOrder(
          item.variantId,
          tx,
        );
        if (!variant || variant.productId !== item.productId) {
          throw new NotFoundException(
            `Variant ${item.variantId} not found for product ${item.productId}`,
          );
        }
        if (
          !variant.product ||
          variant.product.deletedAt ||
          variant.product.status !== CategoryProductStatus.ACTIVE
        ) {
          throw new BadRequestException(
            `"${variant.product?.name ?? 'Product'}" is not currently available`,
          );
        }
        if (item.quantity > variant.quantity) {
          throw new BadRequestException(
            `Only ${variant.quantity} of "${variant.product.name} - ${variant.name}" available, requested ${item.quantity}`,
          );
        }

        const unitPrice = Number(variant.salePrice);
        const totalPrice = round2(unitPrice * item.quantity);
        subtotal += totalPrice;

        orderItems.push({
          productId: variant.productId,
          variantId: variant.id,
          comboId: null,
          name: `${variant.product.name} - ${variant.name}`,
          nameTh: variant.nameTh,
          sku: variant.sku,
          imageUrl: variant.images[0]?.url ?? null,
          attributes:
            (variant.attributes as Prisma.InputJsonValue | null) ?? undefined,
          quantity: item.quantity,
          unitPrice,
          discountAmount: 0,
          totalPrice,
        });

        addDeduction({ variantId: variant.id, quantity: item.quantity });
        continue;
      }

      const product = await this.orderRepository.findProductForOrder(
        item.productId!,
        tx,
      );
      if (!product || product.deletedAt) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
      if (product.status !== CategoryProductStatus.ACTIVE) {
        throw new BadRequestException(
          `"${product.name}" is not currently available`,
        );
      }
      if (product.hasVariants) {
        throw new BadRequestException(`"${product.name}" requires a variantId`);
      }
      if (item.quantity > product.quantity) {
        throw new BadRequestException(
          `Only ${product.quantity} of "${product.name}" available, requested ${item.quantity}`,
        );
      }

      const unitPrice = Number(product.salePrice);
      const totalPrice = round2(unitPrice * item.quantity);
      subtotal += totalPrice;

      orderItems.push({
        productId: product.id,
        variantId: null,
        comboId: null,
        name: product.name,
        nameTh: product.nameTh,
        sku: product.sku,
        imageUrl: product.images[0]?.url ?? null,
        quantity: item.quantity,
        unitPrice,
        discountAmount: 0,
        totalPrice,
      });

      addDeduction({ productId: product.id, quantity: item.quantity });
    }

    return {
      orderItems,
      stockDeductions: Array.from(deductionMap.values()),
      subtotal: round2(subtotal),
    };
  }

  /**
   * Splits an order-level promo discount across its items, weighted by each
   * line's own pre-discount totalPrice, and mutates both discountAmount and
   * totalPrice on each line in place. This is what makes OrderItem.totalPrice
   * satisfy its own documented formula, `(unitPrice * quantity) -
   * discountAmount` (order.prisma) — Order.subtotal itself was already
   * captured pre-discount in buildOrderItems above, so this only touches the
   * per-line snapshot, not the order-level total. The last line absorbs
   * whatever rounding remainder is left over so the per-line shares always
   * sum to exactly discountAmount, never a cent more or less.
   */
  private allocateDiscountAcrossItems(
    orderItems: OrderItemInsert[],
    discountAmount: number,
    subtotal: number,
  ): void {
    if (discountAmount <= 0 || subtotal <= 0 || orderItems.length === 0) return;

    let allocated = 0;
    orderItems.forEach((item, index) => {
      const isLast = index === orderItems.length - 1;
      const share = isLast
        ? round2(discountAmount - allocated)
        : round2((item.totalPrice / subtotal) * discountAmount);

      item.discountAmount = share;
      item.totalPrice = round2(item.totalPrice - share);
      allocated = round2(allocated + share);
    });
  }

  private generateOrderNumber(id: number): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    return `THP-${datePart}-${String(id).padStart(6, '0')}`;
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async getOrderById(
    id: number,
    requesterId: number,
    isAdmin: boolean,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOrderDetail(id, false);
    if (!order) throw new NotFoundException('Order not found');
    if (!isAdmin && order.userId !== requesterId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return new OrderResponseDto(order);
  }

  async getOrderDetailAdmin(id: number): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOrderDetail(id, true);
    if (!order) throw new NotFoundException('Order not found');
    return new OrderResponseDto(order);
  }

  async listMyOrders(
    userId: number,
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<OrderResponseDto>> {
    const result = await this.orderRepository.findOrdersForCustomer(
      userId,
      params,
    );
    return {
      ...result,
      data: result.data.map((order) => new OrderResponseDto(order)),
    };
  }

  async listAllOrdersAdmin(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<OrderResponseDto>> {
    const result = await this.orderRepository.findAllOrdersAdmin(params);
    return {
      ...result,
      data: result.data.map((order) => new OrderResponseDto(order)),
    };
  }

  // ─── Admin — status & payment management ──────────────────────────────────

  async updateStatus(
    id: number,
    dto: UpdateOrderStatusDto,
    changedBy: number,
  ): Promise<OrderResponseDto> {
    const updated = await this.orderRepository.withTransaction(async (tx) => {
      const order = await this.orderRepository.findOrderCore(id, tx);
      if (!order) throw new NotFoundException('Order not found');

      const allowed = ALLOWED_TRANSITIONS[order.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot move an order from ${order.status} to ${dto.status}`,
        );
      }

      const now = new Date();
      const data: Prisma.OrderUncheckedUpdateInput = { status: dto.status };
      if (dto.status === OrderStatus.CONFIRMED) data.confirmedAt = now;
      if (dto.status === OrderStatus.SHIPPED) data.shippedAt = now;
      if (dto.status === OrderStatus.DELIVERED) data.deliveredAt = now;
      if (dto.status === OrderStatus.CANCELLED) {
        data.cancelledAt = now;
        data.cancelReason = dto.cancelReason;
      }

      //* CASH ON DELIVERY IS COLLECTED AT THE DOOR — DELIVERY CONFIRMATION IS
      //* THE MOMENT PAYMENT ACTUALLY HAPPENS FOR THIS METHOD. A FUTURE
      //* CARD/SCANPAY GATEWAY MOVES paymentStatus VIA ITS OWN WEBHOOK
      //* INSTEAD OF THIS STATUS TRANSITION.
      if (
        dto.status === OrderStatus.DELIVERED &&
        order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
        order.paymentStatus === PaymentStatus.PENDING
      ) {
        data.paymentStatus = PaymentStatus.PAID;
        await this.orderRepository.updateLatestPaymentStatus(
          id,
          { status: PaymentStatus.PAID, paidAt: now },
          tx,
        );
      }

      //* CANCELLING AN UNPAID ORDER ALSO CANCELS ITS PAYMENT RECORD. AN
      //* ALREADY-PAID ORDER IS LEFT ALONE — REVERSING COLLECTED MONEY IS A
      //* REFUND, A SEPARATE DECISION FROM "STOP FULFILLING THIS ORDER".
      if (
        dto.status === OrderStatus.CANCELLED &&
        order.paymentStatus === PaymentStatus.PENDING
      ) {
        data.paymentStatus = PaymentStatus.CANCELLED;
        await this.orderRepository.updateLatestPaymentStatus(
          id,
          { status: PaymentStatus.CANCELLED },
          tx,
        );
      }

      if (dto.status === OrderStatus.CANCELLED) {
        await this.restoreStockForCancelledOrder(
          id,
          order.orderNumber,
          changedBy,
          tx,
        );
      }

      await this.orderRepository.updateOrderStatus(id, data, tx);
      await this.orderRepository.createStatusHistory(
        {
          orderId: id,
          status: dto.status,
          note: dto.note ?? dto.cancelReason,
          changedBy,
        },
        tx,
      );

      return this.orderRepository.findOrderDetail(id, false, tx);
    });

    return new OrderResponseDto(updated!);
  }

  /** Whole-order stock restoration on cancellation. Partial (line-item-level) editing of an already-placed order is a deferred future enhancement — see docs/order.md. */
  private async restoreStockForCancelledOrder(
    orderId: number,
    orderNumber: string,
    changedBy: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const items = await this.orderRepository.findOrderItemsForRestock(
      orderId,
      tx,
    );

    const deductionMap = new Map<string, StockDeductionLine>();
    for (const item of items) {
      //* THE SOURCE PRODUCT/VARIANT MAY HAVE BEEN DELETED SINCE THIS ORDER
      //* WAS PLACED (OrderItem.productId/variantId GO SetNull ON DELETE) —
      //* NOTHING TO RESTORE STOCK AGAINST IN THAT CASE.
      if (!item.productId && !item.variantId) continue;

      const key = item.variantId
        ? `variant-${item.variantId}`
        : `product-${item.productId}`;
      const existing = deductionMap.get(key);
      const line: StockDeductionLine = {
        productId: item.variantId ? undefined : (item.productId ?? undefined),
        variantId: item.variantId ?? undefined,
        quantity: item.quantity,
      };
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        deductionMap.set(key, line);
      }
    }

    if (deductionMap.size === 0) return;

    await this.inventoryService.restoreStockForSale(
      Array.from(deductionMap.values()),
      `order:${orderId}`,
      `Order ${orderNumber} cancelled`,
      changedBy,
      tx,
    );
  }

  async updatePaymentStatus(
    id: number,
    dto: UpdatePaymentStatusDto,
    changedBy: number,
  ): Promise<OrderResponseDto> {
    const updated = await this.orderRepository.withTransaction(async (tx) => {
      const order = await this.orderRepository.findOrderCore(id, tx);
      if (!order) throw new NotFoundException('Order not found');

      await this.orderRepository.updatePaymentStatusForOrder(
        id,
        dto.paymentStatus,
        tx,
      );
      await this.orderRepository.updateLatestPaymentStatus(
        id,
        {
          status: dto.paymentStatus,
          ...(dto.paymentStatus === PaymentStatus.PAID && {
            paidAt: new Date(),
          }),
        },
        tx,
      );

      if (dto.note) {
        await this.orderRepository.createStatusHistory(
          { orderId: id, status: order.status, note: dto.note, changedBy },
          tx,
        );
      }

      return this.orderRepository.findOrderDetail(id, false, tx);
    });

    return new OrderResponseDto(updated!);
  }
}
