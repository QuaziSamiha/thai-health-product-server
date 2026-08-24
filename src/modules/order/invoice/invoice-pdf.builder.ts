import PDFDocument from 'pdfkit';
import { OrderResponseDto } from '../dto/order-response.dto';
import { AddressType } from '../../../generated/prisma/enums';
import { INVOICE_SELLER } from './invoice.constants';
import { CONTENT_WIDTH, FONT, INK, PAGE } from './invoice.theme';

//* BASE-14 PDF FONTS (HELVETICA) HAVE NO GLYPH FOR ฿ — USE "THB" IN THE PDF
//* EVEN THOUGH THE WEB UI SHOWS ฿ (BROWSER FONTS COVER IT FINE).
const money = (value: number): string =>
  `THB ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

//* SCREAMING_SNAKE ENUMS READ AS SHOUTING ON A PRINTED INVOICE. LOWER-CASE
//* THE JOINING WORDS SO CASH_ON_DELIVERY BECOMES "Cash on Delivery" RATHER
//* THAN THE NAIVE "Cash On Delivery".
const MINOR_WORDS = new Set(['on', 'of', 'and', 'the', 'for', 'to', 'in']);

const titleCase = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((word, index) =>
      index > 0 && MINOR_WORDS.has(word)
        ? word
        : word.replace(/^\w/, (character) => character.toUpperCase()),
    )
    .join(' ');

type Tone = { bg: string; fg: string };

//* PILL COLOURS ARE KEYED OFF THE *MEANING* OF A STATUS, NOT ITS ENUM, SO ONE
//* TABLE COVERS BOTH OrderStatus AND PaymentStatus (AND ANY VALUE ADDED LATER
//* FALLS BACK TO THE NEUTRAL BLUE INSTEAD OF THROWING).
function toneFor(status: string): Tone {
  switch (status) {
    case 'PAID':
    case 'DELIVERED':
      return { bg: INK.successBg, fg: INK.successFg };
    case 'PENDING':
    case 'AUTHORIZED':
    case 'PROCESSING':
    case 'PACKED':
      return { bg: INK.warnBg, fg: INK.warnFg };
    case 'FAILED':
    case 'CANCELLED':
    case 'RETURNED':
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return { bg: INK.dangerBg, fg: INK.dangerFg };
    default:
      return { bg: INK.infoBg, fg: INK.infoFg };
  }
}

// ─── Primitive drawing helpers ───────────────────────────────────────────────

/** Measures a wrapped string without moving the document cursor. */
function measure(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  size: number,
  width: number,
): number {
  return doc.font(font).fontSize(size).heightOfString(text, { width });
}

/** Draws a rounded status pill and returns the width it consumed. */
function drawPill(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  tone: Tone,
): number {
  const label = text.replace(/_/g, ' ');
  const width = doc.font(FONT.bold).fontSize(7.5).widthOfString(label) + 18;
  doc.roundedRect(x, y, width, 17, 8.5).fill(tone.bg);
  doc
    .fillColor(tone.fg)
    .font(FONT.bold)
    .fontSize(7.5)
    .text(label, x, y + 5, { width, align: 'center', lineBreak: false });
  return width;
}

/** Same pill, anchored so its right edge lands on `rightEdge`. */
function drawPillRight(
  doc: PDFKit.PDFDocument,
  text: string,
  rightEdge: number,
  y: number,
  tone: Tone,
): void {
  const label = text.replace(/_/g, ' ');
  const width = doc.font(FONT.bold).fontSize(7.5).widthOfString(label) + 18;
  drawPill(doc, text, rightEdge - width, y, tone);
}

/** Small uppercase section label with a short lime rule under it. */
function drawSectionLabel(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
): number {
  doc
    .font(FONT.bold)
    .fontSize(8)
    .fillColor(INK.muted)
    .text(text, x, y, { characterSpacing: 0.8, lineBreak: false });
  doc.rect(x, y + 13, 18, 2).fill(INK.lime);
  return y + 24;
}

// ─── Page furniture ──────────────────────────────────────────────────────────

/**
 * The edge-to-edge navy masthead. Drawn on the first page only; continuation
 * pages get the slimmer `drawContinuationHeader` instead.
 */
function drawMasthead(doc: PDFKit.PDFDocument, order: OrderResponseDto): void {
  doc.rect(0, 0, PAGE.width, 132).fill(INK.navy);
  //* THIN LIME KEYLINE UNDER THE BAND — THE ONE PLACE THE BRAND ACCENT RUNS
  //* FULL BLEED, WHICH IS WHAT MAKES THE SHEET READ AS "OURS" AT A GLANCE.
  doc.rect(0, 132, PAGE.width, 4).fill(INK.lime);

  //* SELLER BLOCK — A LIME MONOGRAM TILE, THEN THE TRADING NAME AND CONTACTS.
  doc.roundedRect(PAGE.left, 34, 30, 30, 7).fill(INK.lime);
  doc
    .fillColor(INK.navy)
    .font(FONT.bold)
    .fontSize(13)
    .text('T', PAGE.left, 43, { width: 30, align: 'center', lineBreak: false });

  doc
    .fillColor(INK.white)
    .font(FONT.bold)
    .fontSize(16)
    .text(INVOICE_SELLER.name, PAGE.left + 40, 38, {
      width: 260,
      lineBreak: false,
    });
  doc
    .fillColor(INK.onNavy)
    .font(FONT.regular)
    .fontSize(8)
    .text(INVOICE_SELLER.addressLines.join(', '), PAGE.left + 40, 57, {
      width: 260,
    })
    .text(INVOICE_SELLER.email, PAGE.left + 40, doc.y + 1, { width: 260 })
    .text(INVOICE_SELLER.phone, PAGE.left + 40, doc.y + 1, { width: 260 });

  //* DOCUMENT BLOCK, RIGHT RAIL.
  doc
    .fillColor(INK.white)
    .font(FONT.bold)
    .fontSize(26)
    .text('INVOICE', PAGE.left, 34, {
      width: CONTENT_WIDTH,
      align: 'right',
      characterSpacing: 2,
      lineBreak: false,
    });
  doc
    .fillColor(INK.lime)
    .font(FONT.bold)
    .fontSize(10)
    .text(order.orderNumber, PAGE.left, 68, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    });
  doc
    .fillColor(INK.onNavy)
    .font(FONT.regular)
    .fontSize(8)
    .text(`Issued ${formatDateTime(order.placedAt)}`, PAGE.left, 84, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    });
  drawPillRight(doc, order.status, PAGE.right, 99, toneFor(order.status));
}

/** Slim repeat header for items that spill onto a second page. */
function drawContinuationHeader(
  doc: PDFKit.PDFDocument,
  order: OrderResponseDto,
): void {
  doc.rect(0, 0, PAGE.width, 54).fill(INK.navy);
  doc.rect(0, 54, PAGE.width, 3).fill(INK.lime);
  doc
    .fillColor(INK.white)
    .font(FONT.bold)
    .fontSize(11)
    .text(INVOICE_SELLER.name, PAGE.left, 22, { width: 260, lineBreak: false });
  doc
    .fillColor(INK.onNavy)
    .font(FONT.regular)
    .fontSize(8.5)
    .text(`Invoice ${order.orderNumber} (continued)`, PAGE.left, 24, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    });
}

/** Footer rule + seller line + page counter, stamped on every buffered page. */
function drawFooters(doc: PDFKit.PDFDocument, order: OrderResponseDto): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc
      .moveTo(PAGE.left, PAGE.footerLine)
      .lineTo(PAGE.right, PAGE.footerLine)
      .strokeColor(INK.line)
      .lineWidth(1)
      .stroke();
    doc
      .font(FONT.regular)
      .fontSize(7.5)
      .fillColor(INK.faint)
      .text(
        `${INVOICE_SELLER.name}  ·  ${INVOICE_SELLER.email}  ·  Invoice ${order.orderNumber}`,
        PAGE.left,
        PAGE.footerLine + 9,
        { width: CONTENT_WIDTH * 0.7, lineBreak: false },
      )
      .text(
        `Page ${index + 1} of ${range.count}`,
        PAGE.left,
        PAGE.footerLine + 9,
        { width: CONTENT_WIDTH, align: 'right', lineBreak: false },
      );
  }
}

// ─── Parties ─────────────────────────────────────────────────────────────────

/** Renders BILLED TO / SHIP TO as two panels and returns the y below them. */
function drawParties(
  doc: PDFKit.PDFDocument,
  order: OrderResponseDto,
  top: number,
): number {
  const gutter = 16;
  const columnWidth = (CONTENT_WIDTH - gutter) / 2;
  const rightX = PAGE.left + columnWidth + gutter;
  const innerPad = 14;
  const textWidth = columnWidth - innerPad * 2;

  const customerName = order.customerLastName
    ? `${order.customerFirstName} ${order.customerLastName}`
    : order.customerFirstName;
  const billLines = [order.customerPhone, order.customerEmail ?? ''].filter(
    (line) => line.trim().length > 0,
  );

  const shippingAddress =
    order.addresses.find((address) => address.type === AddressType.SHIPPING) ??
    order.addresses[0];
  const shipName = shippingAddress
    ? `${shippingAddress.recipientName}  ·  ${shippingAddress.phone}`
    : '';
  //* THAI ADDRESS ORDER, NARROWEST FIRST: SUBDISTRICT, DISTRICT / PROVINCE
  //* + POSTAL CODE. subdistrict IS FILTERED RATHER THAN INTERPOLATED BECAUSE
  //* SNAPSHOTS TAKEN BEFORE MIGRATION 20260824090000 CARRY '' FOR IT, AND A
  //* BARE LEADING ", " ON AN INVOICE LOOKS LIKE A BUG.
  const shipLines = shippingAddress
    ? [
        shippingAddress.addressLine,
        [shippingAddress.subdistrict, shippingAddress.district]
          .filter((part) => part.trim().length > 0)
          .join(', '),
        `${shippingAddress.province} ${shippingAddress.postalCode}`,
        shippingAddress.country,
      ].filter((line) => line.trim().length > 0)
    : ['No shipping address recorded.'];

  //* BOTH PANELS SHARE ONE HEIGHT SO THE CARDS STAY VISUALLY PAIRED EVEN WHEN
  //* ONE ADDRESS WRAPS ONTO MORE LINES THAN THE OTHER.
  const blockHeight = (name: string, lines: string[]): number => {
    const nameHeight = name
      ? measure(doc, name, FONT.bold, 10, textWidth) + 3
      : 0;
    const bodyHeight = lines.reduce(
      (total, line) =>
        total + measure(doc, line, FONT.regular, 8.5, textWidth) + 1.5,
      0,
    );
    return nameHeight + bodyHeight;
  };
  const panelHeight =
    Math.max(
      blockHeight(customerName, billLines),
      blockHeight(shipName, shipLines),
    ) +
    innerPad * 2 +
    15;

  const drawPanel = (
    x: number,
    label: string,
    name: string,
    lines: string[],
  ): void => {
    doc.roundedRect(x, top, columnWidth, panelHeight, 8).fill(INK.panel);
    doc
      .roundedRect(x, top, columnWidth, panelHeight, 8)
      .strokeColor(INK.line)
      .lineWidth(1)
      .stroke();
    //* LIME SPINE ON THE LEFT EDGE OF EACH PANEL.
    doc.rect(x, top + 10, 2.5, panelHeight - 20).fill(INK.lime);

    let y = top + innerPad;
    doc
      .font(FONT.bold)
      .fontSize(7.5)
      .fillColor(INK.muted)
      .text(label, x + innerPad, y, {
        characterSpacing: 0.8,
        lineBreak: false,
      });
    y += 15;
    if (name) {
      doc
        .font(FONT.bold)
        .fontSize(10)
        .fillColor(INK.heading)
        .text(name, x + innerPad, y, { width: textWidth });
      y = doc.y + 3;
    }
    doc.font(FONT.regular).fontSize(8.5).fillColor(INK.body);
    for (const line of lines) {
      doc.text(line, x + innerPad, y, { width: textWidth });
      y = doc.y + 1.5;
    }
  };

  drawPanel(PAGE.left, 'BILLED TO', customerName, billLines);
  drawPanel(rightX, 'SHIP TO', shipName, shipLines);

  return top + panelHeight;
}

// ─── Items table ─────────────────────────────────────────────────────────────

const TABLE = {
  nameX: PAGE.left + 14,
  nameW: 244,
  qtyX: PAGE.left + 262,
  qtyW: 46,
  unitX: PAGE.left + 316,
  unitW: 80,
  totalX: PAGE.left + 404,
  totalW: 81,
};

/** Draws the column header band and returns the y where rows start. */
function drawItemsHeader(doc: PDFKit.PDFDocument, top: number): number {
  doc.rect(PAGE.left, top, CONTENT_WIDTH, 26).fill(INK.navy);
  doc.font(FONT.bold).fontSize(7.5).fillColor(INK.white);
  const textY = top + 9.5;
  doc.text('DESCRIPTION', TABLE.nameX, textY, {
    width: TABLE.nameW,
    characterSpacing: 0.6,
    lineBreak: false,
  });
  doc.text('QTY', TABLE.qtyX, textY, {
    width: TABLE.qtyW,
    align: 'right',
    characterSpacing: 0.6,
    lineBreak: false,
  });
  doc.text('UNIT PRICE', TABLE.unitX, textY, {
    width: TABLE.unitW,
    align: 'right',
    characterSpacing: 0.6,
    lineBreak: false,
  });
  doc.text('AMOUNT', TABLE.totalX, textY, {
    width: TABLE.totalW,
    align: 'right',
    characterSpacing: 0.6,
    lineBreak: false,
  });
  return top + 26;
}

/** Second line under an item name: SKU and frozen variant attributes. */
function itemDetails(item: OrderResponseDto['items'][number]): string {
  return [
    item.sku ? `SKU ${item.sku}` : null,
    item.attributes && Object.keys(item.attributes).length > 0
      ? Object.entries(item.attributes)
          .map(([key, value]) => `${titleCase(key)}: ${String(value)}`)
          .join('  ·  ')
      : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
}

/**
 * Renders every line item, breaking to a new page when a row would cross the
 * footer. Returns the y just below the last row.
 */
function drawItems(
  doc: PDFKit.PDFDocument,
  order: OrderResponseDto,
  top: number,
): number {
  let y = drawItemsHeader(doc, top);
  let zebra = false;

  for (const item of order.items) {
    const details = itemDetails(item);
    //* ROW HEIGHT IS MEASURED UP FRONT — THE OLD BUILDER GUESSED AT 14pt AND
    //* LONG PRODUCT NAMES RAN THROUGH THE ROW BELOW THEM.
    const nameHeight = measure(doc, item.name, FONT.bold, 9.5, TABLE.nameW);
    const detailsHeight = details
      ? measure(doc, details, FONT.regular, 7.5, TABLE.nameW) + 3
      : 0;
    const rowHeight = Math.max(nameHeight + detailsHeight + 18, 34);

    if (y + rowHeight > PAGE.bodyBottom) {
      doc.addPage();
      drawContinuationHeader(doc, order);
      y = drawItemsHeader(doc, 84);
      zebra = false;
    }

    if (zebra) {
      doc.rect(PAGE.left, y, CONTENT_WIDTH, rowHeight).fill(INK.zebra);
    }
    zebra = !zebra;

    const textY = y + 9;
    doc
      .font(FONT.bold)
      .fontSize(9.5)
      .fillColor(INK.heading)
      .text(item.name, TABLE.nameX, textY, { width: TABLE.nameW });
    if (details) {
      doc
        .font(FONT.regular)
        .fontSize(7.5)
        .fillColor(INK.faint)
        .text(details, TABLE.nameX, doc.y + 2, { width: TABLE.nameW });
    }

    doc
      .font(FONT.regular)
      .fontSize(9.5)
      .fillColor(INK.body)
      .text(String(item.quantity), TABLE.qtyX, textY, {
        width: TABLE.qtyW,
        align: 'right',
        lineBreak: false,
      })
      .text(money(item.unitPrice), TABLE.unitX, textY, {
        width: TABLE.unitW,
        align: 'right',
        lineBreak: false,
      });
    doc
      .font(FONT.bold)
      .fillColor(INK.heading)
      .text(money(item.totalPrice), TABLE.totalX, textY, {
        width: TABLE.totalW,
        align: 'right',
        lineBreak: false,
      });

    y += rowHeight;
    doc
      .moveTo(PAGE.left, y)
      .lineTo(PAGE.right, y)
      .strokeColor(INK.hairline)
      .lineWidth(1)
      .stroke();
  }

  //* CLOSING RULE UNDER THE TABLE, HEAVIER THAN THE PER-ROW HAIRLINES.
  doc
    .moveTo(PAGE.left, y)
    .lineTo(PAGE.right, y)
    .strokeColor(INK.line)
    .lineWidth(1)
    .stroke();
  return y;
}

// ─── Totals ──────────────────────────────────────────────────────────────────

type TotalsLine = { label: string; value: string; credit?: boolean };

function buildTotalsLines(order: OrderResponseDto): TotalsLine[] {
  const lines: TotalsLine[] = [
    { label: 'Subtotal', value: money(order.subtotal) },
  ];

  if (order.discountAmount > 0) {
    lines.push({
      label: order.appliedPromoCode
        ? `Discount (${order.appliedPromoCode})`
        : 'Discount',
      value: `- ${money(order.discountAmount)}`,
      credit: true,
    });
  }

  //* A WAIVED DELIVERY IS SHOWN AS TWO LINES, NOT ONE ZERO. AN INVOICE THAT
  //* READS "Delivery Charge  ฿0.00" LOOKS LIKE A ZONE THAT HAPPENS TO BE FREE;
  //* THE PROMISE THAT MADE IT FREE IS WHAT THE CUSTOMER WANTS TO SEE, AND WHAT
  //* SUPPORT NEEDS WHEN THEY ASK ABOUT IT LATER. Order.deliveryChargeBase IS
  //* THE PRE-WAIVER FEE — SEE THE DELIVERY SNAPSHOT BLOCK IN order.prisma.
  if (
    order.freeDeliveryApplied &&
    order.deliveryChargeBase > order.deliveryCharge
  ) {
    lines.push({
      label: 'Delivery Charge',
      value: money(order.deliveryChargeBase),
    });
    lines.push({
      label: order.freeDeliveryRuleName ?? 'Free Delivery',
      value: `- ${money(order.deliveryChargeBase - order.deliveryCharge)}`,
      credit: true,
    });
  } else {
    lines.push({
      label: 'Delivery Charge',
      value: money(order.deliveryCharge),
    });
  }

  if (order.taxAmount > 0) {
    lines.push({ label: 'Tax', value: money(order.taxAmount) });
  }

  return lines;
}

const TOTALS_ROW_HEIGHT = 18;
const TOTALS_BAR_HEIGHT = 38;
const TOTALS_PAD_X = 14;
const TOTALS_VALUE_WIDTH = 95;

type TotalsLayout = {
  lines: TotalsLine[];
  rowHeights: number[];
  bodyHeight: number;
  height: number;
};

/**
 * Measures the totals stack up front. A rule name like "Free delivery over
 * THB 1,000" wraps onto two lines, so rows are sized from the wrapped label
 * instead of a fixed step — otherwise the last row spills past the panel.
 */
function layoutTotals(
  doc: PDFKit.PDFDocument,
  order: OrderResponseDto,
  width: number,
): TotalsLayout {
  const lines = buildTotalsLines(order);
  const labelWidth = width - TOTALS_PAD_X * 2 - TOTALS_VALUE_WIDTH - 8;
  const rowHeights = lines.map((line) =>
    Math.max(
      TOTALS_ROW_HEIGHT,
      measure(doc, line.label, FONT.regular, 9, labelWidth) + 8,
    ),
  );
  const bodyHeight =
    rowHeights.reduce((total, height) => total + height, 0) + 12;
  return {
    lines,
    rowHeights,
    bodyHeight,
    height: bodyHeight + 6 + TOTALS_BAR_HEIGHT,
  };
}

/** Right-hand totals stack ending in the navy grand-total bar. */
function drawTotals(
  doc: PDFKit.PDFDocument,
  order: OrderResponseDto,
  x: number,
  width: number,
  top: number,
): number {
  const { lines, rowHeights, bodyHeight } = layoutTotals(doc, order, width);
  const labelX = x + TOTALS_PAD_X;
  const valueWidth = TOTALS_VALUE_WIDTH;
  const valueX = x + width - TOTALS_PAD_X - valueWidth;

  doc.roundedRect(x, top, width, bodyHeight, 8).fill(INK.panel);

  let y = top + 6;
  lines.forEach((line, index) => {
    doc
      .font(FONT.regular)
      .fontSize(9)
      .fillColor(INK.muted)
      .text(line.label, labelX, y + 5, { width: valueX - labelX - 8 });
    doc
      .font(FONT.regular)
      .fontSize(9)
      .fillColor(line.credit ? INK.limeDeep : INK.body)
      .text(line.value, valueX, y + 5, {
        width: valueWidth,
        align: 'right',
        lineBreak: false,
      });
    y += rowHeights[index];
  });

  const barTop = top + bodyHeight + 6;
  doc.roundedRect(x, barTop, width, TOTALS_BAR_HEIGHT, 8).fill(INK.navy);
  doc
    .font(FONT.bold)
    .fontSize(9)
    .fillColor(INK.onNavy)
    .text('TOTAL DUE', labelX, barTop + 9, {
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc
    .font(FONT.regular)
    .fontSize(7.5)
    .fillColor(INK.lime)
    .text(
      `${order.items.length} item${order.items.length === 1 ? '' : 's'}`,
      labelX,
      barTop + 22,
      { lineBreak: false },
    );
  doc
    .font(FONT.bold)
    .fontSize(15)
    .fillColor(INK.white)
    .text(money(order.totalAmount), valueX - 20, barTop + 12, {
      width: valueWidth + 20,
      align: 'right',
      lineBreak: false,
    });

  return barTop + TOTALS_BAR_HEIGHT;
}

// ─── Payment / delivery summary ──────────────────────────────────────────────

/** Left-hand column beside the totals: how the order was paid and shipped. */
function drawPaymentSummary(
  doc: PDFKit.PDFDocument,
  order: OrderResponseDto,
  x: number,
  width: number,
  top: number,
): number {
  const payment = order.payments[0];
  const paymentStatus = payment ? payment.status : order.paymentStatus;
  let y = drawSectionLabel(doc, 'PAYMENT', x, top);

  doc
    .font(FONT.bold)
    .fontSize(10)
    .fillColor(INK.heading)
    .text(titleCase(order.paymentMethod), x, y, { width });
  const pillTop = doc.y + 6;
  drawPill(doc, paymentStatus, x, pillTop, toneFor(paymentStatus));
  y = pillTop + 17 + 10;

  if (payment?.paidAt) {
    doc
      .font(FONT.regular)
      .fontSize(8.5)
      .fillColor(INK.muted)
      .text(`Paid ${formatDateTime(payment.paidAt)}`, x, y, { width });
    y = doc.y + 2;
  }
  if (payment?.transactionId) {
    doc
      .font(FONT.regular)
      .fontSize(8.5)
      .fillColor(INK.muted)
      .text(`Ref ${payment.transactionId}`, x, y, { width });
    y = doc.y + 2;
  }

  const deliveryLines = [
    order.deliveryZoneName ? `Zone: ${order.deliveryZoneName}` : null,
    order.estimatedDeliveryFrom && order.estimatedDeliveryTo
      ? `Estimated ${formatDay(order.estimatedDeliveryFrom)} - ${formatDay(
          order.estimatedDeliveryTo,
        )}`
      : null,
  ].filter((line): line is string => line !== null);

  if (deliveryLines.length > 0) {
    y = drawSectionLabel(doc, 'DELIVERY', x, y + 14);
    doc.font(FONT.regular).fontSize(8.5).fillColor(INK.body);
    for (const line of deliveryLines) {
      doc.text(line, x, y, { width });
      y = doc.y + 2;
    }
  }

  return y;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Builds a PDF invoice from data the caller already fetched via the same
 * owner/admin-checked path as GET /order/:id. Pages are buffered so the
 * footer can stamp "Page x of y" once the final page count is known.
 */
export function buildInvoicePdf(order: OrderResponseDto): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    //* margin: 0 BECAUSE THE MASTHEAD AND TABLE BANDS ARE DRAWN FULL BLEED —
    //* EVERY BLOCK POSITIONS ITSELF AGAINST PAGE.left/right INSTEAD.
    margin: 0,
    bufferPages: true,
    info: {
      Title: `Invoice ${order.orderNumber}`,
      Author: INVOICE_SELLER.name,
      Subject: `Invoice for order ${order.orderNumber}`,
    },
  });

  drawMasthead(doc, order);

  let y = drawParties(doc, order, PAGE.bodyTop);
  y = drawItems(doc, order, y + 26);

  // ─── Summary block: payment on the left, totals on the right ─────────────
  const totalsWidth = 250;
  const totalsX = PAGE.right - totalsWidth;
  let summaryY = y + 22;

  //* KEEP THE MONEY TOGETHER: IF THE TOTALS BAR WOULD STRADDLE THE FOOTER,
  //* MOVE THE WHOLE SUMMARY TO A FRESH PAGE RATHER THAN SPLIT IT.
  if (
    summaryY + layoutTotals(doc, order, totalsWidth).height >
    PAGE.bodyBottom
  ) {
    doc.addPage();
    drawContinuationHeader(doc, order);
    summaryY = 90;
  }

  const totalsBottom = drawTotals(doc, order, totalsX, totalsWidth, summaryY);
  const paymentBottom = drawPaymentSummary(
    doc,
    order,
    PAGE.left,
    totalsX - PAGE.left - 24,
    summaryY,
  );
  y = Math.max(totalsBottom, paymentBottom);

  // ─── Customer note ───────────────────────────────────────────────────────
  const note = order.customerNote?.trim();
  if (note) {
    y += 24;
    const noteWidth = CONTENT_WIDTH - 28;
    const noteHeight = measure(doc, note, FONT.oblique, 8.5, noteWidth) + 38;
    if (y + noteHeight > PAGE.bodyBottom) {
      doc.addPage();
      drawContinuationHeader(doc, order);
      y = 90;
    }
    doc.roundedRect(PAGE.left, y, CONTENT_WIDTH, noteHeight, 8).fill(INK.panel);
    doc.rect(PAGE.left, y + 10, 2.5, noteHeight - 20).fill(INK.lime);
    doc
      .font(FONT.bold)
      .fontSize(7.5)
      .fillColor(INK.muted)
      .text('ORDER NOTE', PAGE.left + 14, y + 13, {
        characterSpacing: 0.8,
        lineBreak: false,
      });
    doc
      .font(FONT.oblique)
      .fontSize(8.5)
      .fillColor(INK.body)
      .text(note, PAGE.left + 14, y + 28, { width: noteWidth });
    y += noteHeight;
  }

  // ─── Closing line ────────────────────────────────────────────────────────
  if (y + 46 <= PAGE.bodyBottom) {
    doc
      .font(FONT.bold)
      .fontSize(9)
      .fillColor(INK.heading)
      .text('Thank you for shopping with us.', PAGE.left, y + 26, {
        width: CONTENT_WIDTH,
        align: 'center',
        lineBreak: false,
      });
    doc
      .font(FONT.regular)
      .fontSize(7.5)
      .fillColor(INK.faint)
      .text(
        'This invoice was generated electronically and is valid without a signature.',
        PAGE.left,
        y + 40,
        { width: CONTENT_WIDTH, align: 'center', lineBreak: false },
      );
  }

  drawFooters(doc, order);
  return doc;
}

//* pdfkit's PDFDocument IS A READABLE STREAM — DRAIN IT INTO ONE Buffer SO
//* THE CONTROLLER CAN SET Content-Length AND SEND IT IN A SINGLE res.send().
export function streamPdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
