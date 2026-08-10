//* ═══════════════════════════════════════════════════════════════════════
//* ORDER SELECT SHAPES — PRISMA PROJECTIONS. KEEP IN SYNC WITH THE DTO
//* CONSTRUCTORS THEY FEED (see src/modules/order/dto/order-response.dto.ts).
//* ═══════════════════════════════════════════════════════════════════════

import { USER_MINIFIED_SELECT } from '../product/product.select';

export const ORDER_ITEM_SELECT = {
  id: true,
  productId: true,
  variantId: true,
  comboId: true,
  name: true,
  nameTh: true,
  sku: true,
  imageUrl: true,
  attributes: true,
  quantity: true,
  unitPrice: true,
  discountAmount: true,
  totalPrice: true,
} as const;

export const ORDER_ADDRESS_SELECT = {
  id: true,
  type: true,
  recipientName: true,
  phone: true,
  addressLine: true,
  state: true,
  region: true,
  postalCode: true,
  country: true,
  sourceAddressId: true,
} as const;

//* gatewayResponse IS DELIBERATELY EXCLUDED — RAW GATEWAY PAYLOADS ARE AN
//* INTERNAL AUDIT/DEBUG FIELD, NEVER RETURNED THROUGH THE API.
export const PAYMENT_SELECT = {
  id: true,
  sid: true,
  type: true,
  method: true,
  status: true,
  amount: true,
  provider: true,
  transactionId: true,
  failureReason: true,
  paidAt: true,
  createdAt: true,
} as const;

export const ORDER_STATUS_HISTORY_SELECT = {
  id: true,
  status: true,
  note: true,
  createdAt: true,
  changedByUser: { select: USER_MINIFIED_SELECT },
} as const;

//* BASE SHAPE — EVERY ORDER READ (ADMIN LIST, "MY ORDERS", SINGLE LOOKUP)
//* USES THIS. statusHistory IS NOT INCLUDED HERE — SEE ORDER_SELECT_WITH_HISTORY.
export const ORDER_SELECT = {
  id: true,
  sid: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  customerFirstName: true,
  customerLastName: true,
  customerEmail: true,
  customerPhone: true,
  subtotal: true,
  discountAmount: true,
  deliveryCharge: true,
  taxAmount: true,
  totalAmount: true,
  appliedPromoCode: true,
  customerNote: true,
  cancelReason: true,
  placedAt: true,
  confirmedAt: true,
  shippedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  userId: true,
  items: { select: ORDER_ITEM_SELECT },
  addresses: { select: ORDER_ADDRESS_SELECT },
  payments: { select: PAYMENT_SELECT },
  createdAt: true,
  updatedAt: true,
} as const;

//* ADMIN DETAIL VIEW — ADDS THE FULL STATUS-CHANGE AUDIT TRAIL, OLDEST FIRST.
export const ORDER_SELECT_WITH_HISTORY = {
  ...ORDER_SELECT,
  statusHistory: {
    select: ORDER_STATUS_HISTORY_SELECT,
    orderBy: { createdAt: 'asc' },
  },
} as const;
