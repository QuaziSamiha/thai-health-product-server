import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import {
  OrderStatus,
  PaymentStatus,
  PaymentTransactionType,
} from '../../generated/prisma/enums';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import { ORDER_SELECT, ORDER_SELECT_WITH_HISTORY } from './order.select';

@Injectable()
export class OrderRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — placement-time validation ──────────────────────────────────
  //* DIRECT product/product_variant/combo_products READS, DECOUPLED FROM
  //* ProductModule/ComboProductModule — SAME PATTERN InventoryRepository
  //* ALREADY USES FOR ITS OWN "STOCK TARGET" LOOKUPS (findProductStockInfo/
  //* findVariantStockInfo).

  async findProductForOrder(id: number, tx: Prisma.TransactionClient) {
    return tx.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        nameTh: true,
        sku: true,
        status: true,
        deletedAt: true,
        hasVariants: true,
        quantity: true,
        salePrice: true,
        images: {
          where: { isPrimary: true, variantId: null },
          select: { url: true },
          take: 1,
        },
      },
    });
  }

  async findVariantForOrder(id: number, tx: Prisma.TransactionClient) {
    return tx.productVariant.findUnique({
      where: { id },
      select: {
        id: true,
        productId: true,
        name: true,
        nameTh: true,
        sku: true,
        quantity: true,
        salePrice: true,
        attributes: true,
        //* THE VARIANT'S OWN SALEABILITY GATE, CHECKED ALONGSIDE THE PARENT
        //* PRODUCT'S status IN buildOrderItems — A RETIRED SIZE OF AN
        //* OTHERWISE-ACTIVE PRODUCT MUST NOT BE ORDERABLE THROUGH A STALE
        //* CART OR A HAND-BUILT REQUEST.
        variantStatus: true,
        product: {
          select: {
            id: true,
            name: true,
            status: true,
            deletedAt: true,
            //* FALLBACK SOURCE WHEN THE VARIANT HAS NO IMAGE OF ITS OWN — SEE
            //* order.service.ts buildOrderItems, MOST VARIANTS IN THIS
            //* CATALOG ONLY EVER GET A PRODUCT-LEVEL IMAGE.
            images: {
              where: { isPrimary: true, variantId: null },
              select: { url: true },
              take: 1,
            },
          },
        },
        images: {
          where: { isPrimary: true },
          select: { url: true },
          take: 1,
        },
      },
    });
  }

  async findComboForOrder(id: number, tx: Prisma.TransactionClient) {
    return tx.comboProduct.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        titleTh: true,
        sku: true,
        status: true,
        deletedAt: true,
        comboPrice: true,
        quantity: true,
        offeredQuantity: true,
        images: {
          where: { isPrimary: true },
          select: { url: true },
          take: 1,
        },
        items: {
          select: {
            productId: true,
            variantId: true,
            quantity: true,
            //* A COMBO PINNING A RETIRED VARIANT ALREADY HAS quantity 0 (THE
            //* TRIGGER READS ITS STOCK AS 0), SO THE SELLABLE CHECK IN
            //* buildOrderItems WOULD CATCH IT ANYWAY — BUT AS "OUT OF STOCK",
            //* WHICH SENDS THE CUSTOMER BACK TO WAIT FOR A RESTOCK THAT WILL
            //* NEVER HELP. THIS SELECT LETS THAT CASE SAY WHAT IT ACTUALLY IS.
            variant: { select: { name: true, variantStatus: true } },
          },
        },
      },
    });
  }

  // ─── Writes — order placement ────────────────────────────────────────────

  async createOrderShell(
    data: Prisma.OrderUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.order.create({ data, select: { id: true, sid: true } });
  }

  async finalizeOrderNumber(
    id: number,
    orderNumber: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.order.update({ where: { id }, data: { orderNumber } });
  }

  async createOrderAddress(
    data: Prisma.OrderAddressUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.orderAddress.create({ data });
  }

  async createOrderItems(
    items: Prisma.OrderItemCreateManyInput[],
    tx: Prisma.TransactionClient,
  ) {
    return tx.orderItem.createMany({ data: items });
  }

  async createStatusHistory(
    data: {
      orderId: number;
      status: OrderStatus;
      note?: string;
      changedBy?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.orderStatusHistory.create({ data });
  }

  async createPayment(
    data: Prisma.PaymentUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.payment.create({ data });
  }

  // ─── Reads — retrieval ────────────────────────────────────────────────────

  async findOrderDetail(
    id: number,
    withHistory: boolean,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.order.findUnique({
      where: { id },
      select: withHistory ? ORDER_SELECT_WITH_HISTORY : ORDER_SELECT,
    });
  }

  /**
   * sid IS THE UNGUESSABLE PUBLIC IDENTIFIER (UUID) — THE ONLY LOOKUP A
   * GUEST CHECKOUT CAN USE SINCE THEY HAVE NO ACCOUNT/JWT TO OWNERSHIP-CHECK
   * AGAINST. USED ONLY BY THE POST-CHECKOUT INVOICE DOWNLOAD — SEE
   * OrderService.getInvoicePdfBufferBySid.
   */
  async findOrderDetailBySid(sid: string) {
    return this.prisma.order.findUnique({
      where: { sid },
      select: ORDER_SELECT,
    });
  }

  /** Lean lookup for ownership/status-machine checks — avoids paying for the full nested select. */
  async findOrderCore(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        orderNumber: true,
      },
    });
  }

  /** Line-level snapshot used to restore stock on cancellation. */
  async findOrderItemsForRestock(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.orderItem.findMany({
      where: { orderId: id },
      select: { productId: true, variantId: true, quantity: true },
    });
  }

  async findOrdersForCustomer(
    userId: number,
    params: PaginationQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return this.paginationService.paginate<
      Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>,
      typeof client.order
    >(client.order, params, {
      where: { userId },
      select: ORDER_SELECT,
      searchableFields: ['orderNumber'],
      defaultSortField: 'createdAt',
    });
  }

  async findAllOrdersAdmin(
    params: PaginationQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return this.paginationService.paginate<
      Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>,
      typeof client.order
    >(client.order, params, {
      select: ORDER_SELECT,
      searchableFields: [
        'orderNumber',
        'customerEmail',
        'customerPhone',
        'customerFirstName',
        'customerLastName',
      ],
      defaultSortField: 'createdAt',
    });
  }

  // ─── Writes — status/payment management ──────────────────────────────────

  async updateOrderStatus(
    id: number,
    data: Prisma.OrderUncheckedUpdateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.order.update({ where: { id }, data, select: { id: true } });
  }

  async updatePaymentStatusForOrder(
    orderId: number,
    paymentStatus: PaymentStatus,
    tx: Prisma.TransactionClient,
  ) {
    return tx.order.update({
      where: { id: orderId },
      data: { paymentStatus },
      select: { id: true },
    });
  }

  /** Updates every CHARGE payment row on the order — v1 only ever creates one at placement time. */
  async updateLatestPaymentStatus(
    orderId: number,
    data: Prisma.PaymentUncheckedUpdateManyInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.payment.updateMany({
      where: { orderId, type: PaymentTransactionType.CHARGE },
      data,
    });
  }
}
