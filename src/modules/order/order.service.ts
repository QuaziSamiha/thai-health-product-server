import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  CartLineStatus,
  CartLineValidationDto,
  ValidateCartDto,
  ValidateCartResponseDto,
} from './dto/validate-cart.dto';
import {
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
} from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import {
  buildInvoicePdf,
  streamPdfToBuffer,
} from './invoice/invoice-pdf.builder';

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

//* THE CATALOG-DERIVED HALF OF AN OrderItem ROW — EVERYTHING resolveCartLine
//* CAN KNOW WITHOUT SEEING THE REQUESTED QUANTITY OR THE PROMO SPLIT.
type OrderItemSnapshot = Pick<
  OrderItemInsert,
  'productId' | 'variantId' | 'comboId' | 'nameTh' | 'sku' | 'imageUrl'
> & { attributes?: Prisma.InputJsonValue };

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

/**
 * One line's availability verdict, shared by placement (which throws on
 * anything but OK) and cart validation (which reports it). `deductions` is
 * expressed **per single unit or bundle** — the caller multiplies by the
 * requested quantity — which is what lets a combo's component list and a
 * plain product travel through the same shape.
 */
type ResolvedCartLine = {
  status: CartLineStatus;
  message: string;
  //* WHICH EXCEPTION PLACEMENT SHOULD RAISE: A MISSING ROW IS A 404,
  //* EVERYTHING ELSE A 400 — THE SPLIT buildOrderItems HAS ALWAYS MADE.
  notFound: boolean;
  name: string;
  available: number;
  unitPrice: number;
  deductions: StockDeductionLine[];
  snapshot: OrderItemSnapshot;
};

/** A line whose catalog row could not be loaded at all — nothing to snapshot, nothing to deduct. */
function unresolvableLine(
  message: string,
  notFound: boolean,
): ResolvedCartLine {
  return {
    status: CartLineStatus.UNAVAILABLE,
    message,
    notFound,
    name: 'Unavailable item',
    available: 0,
    unitPrice: 0,
    deductions: [],
    snapshot: {
      productId: null,
      variantId: null,
      comboId: null,
      nameTh: null,
      sku: null,
      imageUrl: null,
    },
  };
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

//* TERMINAL STATUSES THAT GIVE THE ORDER'S STOCK BACK.
//*
//* Both are reached only from states in which nothing has shipped — CANCELLED
//* from PENDING/CONFIRMED/PROCESSING/PACKED, FAILED only from PENDING — so the
//* units placement claimed are still physically on the shelf and must return
//* to sellable stock. FAILED previously did not restore at all: a payment that
//* never completed quietly consumed inventory forever.
//*
//* RETURNED/REFUNDED are deliberately NOT here. Those goods have physically
//* left and come back, and whether they are resellable is an inspection
//* decision, not a status transition — an admin puts them back through the
//* inventory module, which records who did it and why.
const STOCK_RESTORING_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.CANCELLED,
  OrderStatus.FAILED,
]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly addressService: AddressService,
    private readonly inventoryService: InventoryService,
    private readonly promotionService: PromotionService,
    private readonly configService: ConfigService,
  ) {}

  //* CENTRALIZES THE OrderItem.imageUrl RELATIVE→ABSOLUTE PREFIX SO EVERY
  //* new OrderResponseDto(...) CALL SITE STAYS A ONE-LINER — SAME
  //* app.baseUrl CONVENTION AS ProductService.
  private getBaseUrl(): string | undefined {
    return this.configService.get<string>('app.baseUrl');
  }

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

    return new OrderResponseDto(order!, this.getBaseUrl());
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
    const fallbackRecipientName = dto.lastName
      ? `${dto.firstName} ${dto.lastName}`.trim()
      : dto.firstName.trim();

    if (userId) {
      if (dto.addressId) {
        const saved = await this.addressService.getAddressById(
          userId,
          dto.addressId,
        );
        return {
          recipientName: saved.recipientName,
          //* saved.phone CAN BE undefined — ADDRESS-BOOK ROWS ARE ALLOWED TO
          //* HAVE NO PHONE (SEE address.prisma). dto.phone IS ALWAYS PRESENT
          //* (CreateOrderDto.phone IS REQUIRED), SO IT'S THE GUARANTEED
          //* FALLBACK FOR THE OrderAddress SNAPSHOT, WHICH STAYS NON-NULL.
          phone: saved.phone ?? dto.phone,
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
        //* payload.phone WAS ALREADY SEEDED WITH dto.phone AS A FALLBACK
        //* ABOVE, SO saved.phone IS ALWAYS DEFINED HERE — THE ?? IS JUST TO
        //* SATISFY AddressResponseDto.phone'S WIDER (OPTIONAL) TYPE.
        phone: saved.phone ?? dto.phone,
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
      const resolved = await this.resolveCartLine(item, tx);

      //* PLACEMENT IS ALL-OR-NOTHING: THE FIRST LINE THAT ISN'T OK ABORTS THE
      //* WHOLE TRANSACTION. validateCart CONSUMES THE VERY SAME RESOLUTIONS
      //* BUT COLLECTS THEM INSTEAD OF THROWING — WHICH IS THE ENTIRE REASON
      //* THE AVAILABILITY RULES LIVE IN resolveCartLine AND NOT INLINE HERE.
      //* ONE COPY, SO THE CART PAGE AND CHECKOUT CAN NEVER DISAGREE.
      if (resolved.status !== CartLineStatus.OK) {
        throw resolved.notFound
          ? new NotFoundException(resolved.message)
          : new BadRequestException(resolved.message);
      }

      const totalPrice = round2(resolved.unitPrice * item.quantity);
      subtotal += totalPrice;

      orderItems.push({
        ...resolved.snapshot,
        name: resolved.name,
        quantity: item.quantity,
        unitPrice: resolved.unitPrice,
        discountAmount: 0,
        totalPrice,
      });

      //* resolved.deductions IS EXPRESSED PER SINGLE UNIT/BUNDLE, SO THE
      //* MULTIPLY HAPPENS HERE — THAT'S WHAT LETS A COMBO'S COMPONENT LIST
      //* AND A PLAIN PRODUCT SHARE ONE SHAPE.
      for (const line of resolved.deductions) {
        addDeduction({ ...line, quantity: line.quantity * item.quantity });
      }
    }

    return {
      orderItems,
      stockDeductions: Array.from(deductionMap.values()),
      subtotal: round2(subtotal),
    };
  }

  // ─── Cart validation ──────────────────────────────────────────────────────

  /**
   * Read-only dry run of the placement rules, used by the storefront cart and
   * checkout pages to catch an over-quantity or vanished line *before* the
   * customer invests any effort in the funnel.
   *
   * It exists because ProductResponsePublicDto deliberately withholds the
   * exact quantity/totalStock counts (so inventory levels don't leak to
   * scrapers), which leaves the client with no number to compare its cart
   * against. Posting the cart here returns a per-line verdict instead — the
   * only stock figures disclosed are for lines the customer already holds.
   *
   * This is advisory, never authoritative: nothing is reserved and stock can
   * still move between this call and placement. The guarded decrement inside
   * placeOrder remains the one and only place stock is actually claimed.
   */
  async validateCart(dto: ValidateCartDto): Promise<ValidateCartResponseDto> {
    //* SAME MERGE placeOrder DOES, SO A CART THAT SPLITS ONE PRODUCT ACROSS
    //* TWO LINES IS JUDGED ON ITS COMBINED QUANTITY, NOT PER LINE.
    const items = this.aggregateItems(dto.items);
    const client = this.orderRepository.readClient;

    const lines: CartLineValidationDto[] = [];
    for (const item of items) {
      const resolved = await this.resolveCartLine(item, client);
      lines.push({
        productId: item.productId,
        variantId: item.variantId,
        comboId: item.comboId,
        name: resolved.name,
        requested: item.quantity,
        available: resolved.available,
        status: resolved.status,
        unitPrice: resolved.unitPrice,
        message: resolved.message,
      });
    }

    return {
      valid: lines.every((line) => line.status === CartLineStatus.OK),
      lines,
    };
  }

  /**
   * The single source of truth for "can this line be bought, and how many of
   * it". Consumed by buildOrderItems (which throws on anything but OK) and by
   * validateCart (which reports it). Deliberately never throws itself — the
   * caller decides whether a bad line is fatal.
   *
   * `notFound` distinguishes the two exception types placement has always
   * raised: a missing row is a 404, everything else a 400.
   */
  private async resolveCartLine(
    item: OrderItemDto,
    tx: Prisma.TransactionClient,
  ): Promise<ResolvedCartLine> {
    if (item.comboId) {
      return this.resolveComboLine(item, item.comboId, tx);
    }
    if (item.variantId) {
      return this.resolveVariantLine(item, item.variantId, tx);
    }
    return this.resolveProductLine(item, item.productId!, tx);
  }

  private async resolveComboLine(
    item: OrderItemDto,
    comboId: number,
    tx: Prisma.TransactionClient,
  ): Promise<ResolvedCartLine> {
    const combo = await this.orderRepository.findComboForOrder(comboId, tx);
    if (!combo || combo.deletedAt) {
      return unresolvableLine(`Combo ${comboId} not found`, true);
    }

    const unitPrice = Number(combo.comboPrice);
    const snapshot: OrderItemSnapshot = {
      productId: null,
      variantId: null,
      comboId: combo.id,
      nameTh: combo.titleTh,
      sku: combo.sku,
      imageUrl: combo.images[0]?.url ?? null,
    };
    //* EXPRESSED PER BUNDLE — buildOrderItems MULTIPLIES BY THE BUNDLE COUNT.
    //* NOTE THIS TOUCHES THE COMPONENTS, NEVER ComboProduct.quantity, WHICH IS
    //* TRIGGER-DERIVED AND RECOMPUTES ITSELF ONCE THE COMPONENTS MOVE.
    const deductions: StockDeductionLine[] = combo.items.map((comboItem) => ({
      productId: comboItem.variantId ? undefined : comboItem.productId,
      variantId: comboItem.variantId ?? undefined,
      quantity: comboItem.quantity,
    }));

    const base = {
      name: combo.title,
      unitPrice,
      snapshot,
      deductions,
      notFound: false,
    };

    if (combo.status !== CategoryProductStatus.ACTIVE) {
      return {
        ...base,
        status: CartLineStatus.UNAVAILABLE,
        available: 0,
        message: `"${combo.title}" is not currently available`,
      };
    }

    //* CHECKED BEFORE THE STOCK TEST BELOW ON PURPOSE: A RETIRED PART PINS THE
    //* BUNDLE AT 0 ASSEMBLABLE, SO THE STOCK TEST WOULD FIRE FIRST AND BLAME
    //* STOCK FOR SOMETHING RESTOCKING CANNOT FIX.
    const retired = combo.items.find(
      (comboItem) =>
        comboItem.variant &&
        comboItem.variant.variantStatus !== CategoryProductStatus.ACTIVE,
    );
    if (retired) {
      return {
        ...base,
        status: CartLineStatus.UNAVAILABLE,
        available: 0,
        message: `"${combo.title}" is no longer available — it includes "${retired.variant!.name}", which has been discontinued`,
      };
    }

    const available = Math.min(
      combo.quantity,
      combo.offeredQuantity ?? Infinity,
    );
    if (available === 0) {
      return {
        ...base,
        status: CartLineStatus.OUT_OF_STOCK,
        available: 0,
        message: `"${combo.title}" cannot be assembled right now — out of stock`,
      };
    }
    if (item.quantity > available) {
      return {
        ...base,
        status: CartLineStatus.QUANTITY_REDUCED,
        available,
        message: `Only ${available} of "${combo.title}" available right now, requested ${item.quantity}`,
      };
    }

    return { ...base, status: CartLineStatus.OK, available, message: '' };
  }

  private async resolveVariantLine(
    item: OrderItemDto,
    variantId: number,
    tx: Prisma.TransactionClient,
  ): Promise<ResolvedCartLine> {
    const variant = await this.orderRepository.findVariantForOrder(
      variantId,
      tx,
    );
    if (!variant || variant.productId !== item.productId) {
      return unresolvableLine(
        `Variant ${variantId} not found for product ${item.productId}`,
        true,
      );
    }

    const displayName = variant.product
      ? `${variant.product.name} - ${variant.name}`
      : variant.name;
    const base = {
      name: displayName,
      unitPrice: Number(variant.salePrice),
      snapshot: {
        productId: variant.productId,
        variantId: variant.id,
        comboId: null,
        nameTh: variant.nameTh,
        sku: variant.sku,
        //* MOST VARIANTS HAVE NO IMAGE OF THEIR OWN — FALL BACK TO THE PARENT
        //* PRODUCT'S PRIMARY IMAGE RATHER THAN SNAPSHOTTING null.
        imageUrl:
          variant.images[0]?.url ?? variant.product?.images[0]?.url ?? null,
        attributes:
          (variant.attributes as Prisma.InputJsonValue | null) ?? undefined,
      } satisfies OrderItemSnapshot,
      deductions: [{ variantId: variant.id, quantity: 1 }],
      notFound: false,
    };

    if (
      !variant.product ||
      variant.product.deletedAt ||
      variant.product.status !== CategoryProductStatus.ACTIVE
    ) {
      return {
        ...base,
        status: CartLineStatus.UNAVAILABLE,
        available: 0,
        message: `"${variant.product?.name ?? 'Product'}" is not currently available`,
      };
    }
    //* THE PRODUCT-LEVEL GATE ABOVE ONLY NARROWS TO "THIS PRODUCT IS ON SALE" —
    //* THE VARIANT CAN STILL HAVE BEEN RETIRED ON ITS OWN, IN WHICH CASE IT IS
    //* ALREADY GONE FROM THE PDP AND MUST BE REFUSED HERE TOO (STALE CART,
    //* STALE TAB, OR A HAND-BUILT REQUEST).
    if (variant.variantStatus !== CategoryProductStatus.ACTIVE) {
      return {
        ...base,
        status: CartLineStatus.UNAVAILABLE,
        available: 0,
        message: `"${displayName}" is no longer available`,
      };
    }
    if (variant.quantity === 0) {
      return {
        ...base,
        status: CartLineStatus.OUT_OF_STOCK,
        available: 0,
        message: `"${displayName}" is out of stock`,
      };
    }
    if (item.quantity > variant.quantity) {
      return {
        ...base,
        status: CartLineStatus.QUANTITY_REDUCED,
        available: variant.quantity,
        message: `Only ${variant.quantity} of "${displayName}" available, requested ${item.quantity}`,
      };
    }

    return {
      ...base,
      status: CartLineStatus.OK,
      available: variant.quantity,
      message: '',
    };
  }

  private async resolveProductLine(
    item: OrderItemDto,
    productId: number,
    tx: Prisma.TransactionClient,
  ): Promise<ResolvedCartLine> {
    const product = await this.orderRepository.findProductForOrder(
      productId,
      tx,
    );
    if (!product || product.deletedAt) {
      return unresolvableLine(`Product ${productId} not found`, true);
    }

    const base = {
      name: product.name,
      unitPrice: Number(product.salePrice),
      snapshot: {
        productId: product.id,
        variantId: null,
        comboId: null,
        nameTh: product.nameTh,
        sku: product.sku,
        imageUrl: product.images[0]?.url ?? null,
      } satisfies OrderItemSnapshot,
      deductions: [{ productId: product.id, quantity: 1 }],
      notFound: false,
    };

    if (product.status !== CategoryProductStatus.ACTIVE) {
      return {
        ...base,
        status: CartLineStatus.UNAVAILABLE,
        available: 0,
        message: `"${product.name}" is not currently available`,
      };
    }
    if (product.hasVariants) {
      return {
        ...base,
        status: CartLineStatus.UNAVAILABLE,
        available: 0,
        message: `"${product.name}" requires a variantId`,
      };
    }
    if (product.quantity === 0) {
      return {
        ...base,
        status: CartLineStatus.OUT_OF_STOCK,
        available: 0,
        message: `"${product.name}" is out of stock`,
      };
    }
    if (item.quantity > product.quantity) {
      return {
        ...base,
        status: CartLineStatus.QUANTITY_REDUCED,
        available: product.quantity,
        message: `Only ${product.quantity} of "${product.name}" available, requested ${item.quantity}`,
      };
    }

    return {
      ...base,
      status: CartLineStatus.OK,
      available: product.quantity,
      message: '',
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
    const order = await this.orderRepository.findOrderDetail(id, true);
    if (!order) throw new NotFoundException('Order not found');
    if (!isAdmin && order.userId !== requesterId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return new OrderResponseDto(order, this.getBaseUrl());
  }

  //* SAME FETCH + OWNERSHIP CHECK AS getOrderById — AN INVOICE IS JUST
  //* THAT SAME AUTHORIZED VIEW OF THE ORDER, RENDERED AS A PDF INSTEAD OF JSON.
  async getInvoicePdfBuffer(
    id: number,
    requesterId: number,
    isAdmin: boolean,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.orderRepository.findOrderDetail(id, true);
    if (!order) throw new NotFoundException('Order not found');
    if (!isAdmin && order.userId !== requesterId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    const dto = new OrderResponseDto(order, this.getBaseUrl());
    const buffer = await streamPdfToBuffer(buildInvoicePdf(dto));
    return { buffer, filename: `invoice-${dto.orderNumber}.pdf` };
  }

  //* NO OWNERSHIP CHECK — sid ITSELF (AN UNGUESSABLE UUID, NEVER EXPOSED IN
  //* LISTINGS) IS THE CAPABILITY TOKEN, SAME PATTERN AS A GUEST ORDER
  //* CONFIRMATION LINK. THIS IS WHAT LETS A GUEST (NO ACCOUNT, NO JWT)
  //* DOWNLOAD THEIR OWN INVOICE RIGHT AFTER CHECKOUT — SEE
  //* getInvoicePdfBuffer ABOVE FOR THE AUTHENTICATED owner-or-admin PATH
  //* USED BY "MY ORDERS" LATER.
  async getInvoicePdfBufferBySid(
    sid: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.orderRepository.findOrderDetailBySid(sid);
    if (!order) throw new NotFoundException('Order not found');

    const dto = new OrderResponseDto(order, this.getBaseUrl());
    const buffer = await streamPdfToBuffer(buildInvoicePdf(dto));
    return { buffer, filename: `invoice-${dto.orderNumber}.pdf` };
  }

  async getOrderDetailAdmin(id: number): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOrderDetail(id, true);
    if (!order) throw new NotFoundException('Order not found');
    return new OrderResponseDto(order, this.getBaseUrl());
  }

  async listMyOrders(
    userId: number,
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<OrderResponseDto>> {
    const result = await this.orderRepository.findOrdersForCustomer(
      userId,
      params,
    );
    const baseUrl = this.getBaseUrl();
    return {
      ...result,
      data: result.data.map((order) => new OrderResponseDto(order, baseUrl)),
    };
  }

  async listAllOrdersAdmin(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<OrderResponseDto>> {
    const result = await this.orderRepository.findAllOrdersAdmin(params);
    const baseUrl = this.getBaseUrl();
    return {
      ...result,
      data: result.data.map((order) => new OrderResponseDto(order, baseUrl)),
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

      //* A TERMINAL STATUS THE GOODS NEVER LEFT THE WAREHOUSE FOR MUST HAND
      //* BACK EVERY UNIT PLACEMENT CLAIMED — SEE STOCK_RESTORING_STATUSES.
      if (STOCK_RESTORING_STATUSES.has(dto.status)) {
        const restoredLines = await this.inventoryService.restoreStockForOrder(
          id,
          `Order ${order.orderNumber} ${dto.status.toLowerCase()}`,
          changedBy,
          tx,
        );
        this.logger.log(
          `Order ${order.orderNumber} moved to ${dto.status}; restored stock for ${restoredLines} line(s)`,
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

    return new OrderResponseDto(updated!, this.getBaseUrl());
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

    return new OrderResponseDto(updated!, this.getBaseUrl());
  }
}
