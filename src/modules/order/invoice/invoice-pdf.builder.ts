import PDFDocument from 'pdfkit';
import { OrderResponseDto } from '../dto/order-response.dto';
import { AddressType } from '../../../generated/prisma/enums';
import { INVOICE_SELLER } from './invoice.constants';

//* BASE-14 PDF FONTS (HELVETICA) HAVE NO GLYPH FOR ฿ — USE "THB" IN THE PDF
//* EVEN THOUGH THE WEB UI SHOWS ฿ (BROWSER FONTS COVER IT FINE).
const money = (value: number): string => `THB ${value.toFixed(2)}`;

const PAGE_MARGIN = 50;
const COL = {
  name: PAGE_MARGIN,
  qty: 330,
  unitPrice: 390,
  total: 470,
};
const TABLE_RIGHT_EDGE = 545;

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function drawItemsTableHeader(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#475569')
    .text('ITEM', COL.name, y, { width: COL.qty - COL.name - 10 })
    .text('QTY', COL.qty, y, { width: COL.unitPrice - COL.qty - 10, align: 'right' })
    .text('UNIT PRICE', COL.unitPrice, y, {
      width: COL.total - COL.unitPrice - 10,
      align: 'right',
    })
    .text('TOTAL', COL.total, y, {
      width: TABLE_RIGHT_EDGE - COL.total,
      align: 'right',
    });
  doc
    .moveTo(PAGE_MARGIN, doc.y + 4)
    .lineTo(TABLE_RIGHT_EDGE, doc.y + 4)
    .strokeColor('#CBD5E1')
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6);
  doc.fillColor('#0F172A').font('Helvetica').fontSize(10);
}

/**
 * Builds a one-page-per-order PDF invoice from data the caller already
 * fetched via the same owner/admin-checked path as GET /order/:id.
 */
export function buildInvoicePdf(order: OrderResponseDto): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });

  // ─── Header ────────────────────────────────────────────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#0F172A')
    .text(INVOICE_SELLER.name, PAGE_MARGIN, PAGE_MARGIN);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#64748B')
    .text(INVOICE_SELLER.addressLines.join(', '))
    .text(`${INVOICE_SELLER.email}  ·  ${INVOICE_SELLER.phone}`);

  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor('#0F172A')
    .text('INVOICE', PAGE_MARGIN, PAGE_MARGIN, {
      width: TABLE_RIGHT_EDGE - PAGE_MARGIN,
      align: 'right',
    });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#64748B')
    .text(`Invoice No: ${order.orderNumber}`, {
      width: TABLE_RIGHT_EDGE - PAGE_MARGIN,
      align: 'right',
    })
    .text(`Order Date: ${formatDate(order.placedAt)}`, {
      width: TABLE_RIGHT_EDGE - PAGE_MARGIN,
      align: 'right',
    });

  doc.moveDown(2);
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(TABLE_RIGHT_EDGE, doc.y)
    .strokeColor('#CBD5E1')
    .lineWidth(1)
    .stroke();
  doc.moveDown(1);

  // ─── Bill To / Ship To ─────────────────────────────────────────────────
  const shippingAddress =
    order.addresses.find((address) => address.type === AddressType.SHIPPING) ??
    order.addresses[0];
  const billTop = doc.y;

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#475569')
    .text('BILLED TO', PAGE_MARGIN, billTop);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#0F172A')
    .text(
      order.customerLastName
        ? `${order.customerFirstName} ${order.customerLastName}`
        : order.customerFirstName,
      PAGE_MARGIN,
    )
    .fillColor('#475569')
    .fontSize(9)
    .text(order.customerPhone)
    .text(order.customerEmail ?? '');

  if (shippingAddress) {
    const shipColumnX = 300;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#475569')
      .text('SHIP TO', shipColumnX, billTop);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#0F172A')
      .text(
        `${shippingAddress.recipientName} · ${shippingAddress.phone}`,
        shipColumnX,
        undefined,
        { width: TABLE_RIGHT_EDGE - shipColumnX },
      )
      .fillColor('#475569')
      .text(shippingAddress.addressLine, shipColumnX, undefined, {
        width: TABLE_RIGHT_EDGE - shipColumnX,
      })
      .text(
        `${shippingAddress.region}, ${shippingAddress.state} ${shippingAddress.postalCode}`,
        shipColumnX,
        undefined,
        { width: TABLE_RIGHT_EDGE - shipColumnX },
      )
      .text(shippingAddress.country, shipColumnX, undefined, {
        width: TABLE_RIGHT_EDGE - shipColumnX,
      });
  }

  doc.moveDown(2);

  // ─── Items table ───────────────────────────────────────────────────────
  drawItemsTableHeader(doc);

  for (const item of order.items) {
    if (doc.y > 700) {
      doc.addPage();
      drawItemsTableHeader(doc);
    }

    const rowTop = doc.y;
    const details = [
      item.sku ? `SKU ${item.sku}` : null,
      item.attributes && Object.keys(item.attributes).length > 0
        ? Object.entries(item.attributes)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(' · ')
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#0F172A')
      .text(item.name, COL.name, rowTop, { width: COL.qty - COL.name - 10 });
    if (details) {
      doc.fontSize(8).fillColor('#94A3B8').text(details, COL.name, doc.y, {
        width: COL.qty - COL.name - 10,
      });
    }

    doc
      .fontSize(10)
      .fillColor('#0F172A')
      .text(String(item.quantity), COL.qty, rowTop, {
        width: COL.unitPrice - COL.qty - 10,
        align: 'right',
      })
      .text(money(item.unitPrice), COL.unitPrice, rowTop, {
        width: COL.total - COL.unitPrice - 10,
        align: 'right',
      })
      .text(money(item.totalPrice), COL.total, rowTop, {
        width: TABLE_RIGHT_EDGE - COL.total,
        align: 'right',
      });

    doc.y = Math.max(doc.y, rowTop + 14);
    doc.moveDown(0.8);
    doc
      .moveTo(PAGE_MARGIN, doc.y)
      .lineTo(TABLE_RIGHT_EDGE, doc.y)
      .strokeColor('#EEF2F6')
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.6);
  }

  // ─── Totals ────────────────────────────────────────────────────────────
  if (doc.y > 650) {
    doc.addPage();
  }
  doc.moveDown(0.5);
  const totalsX = 350;
  const totalsWidth = TABLE_RIGHT_EDGE - totalsX;
  const totalsLabelWidth = totalsWidth - 100;

  const totalsRow = (label: string, value: string, bold = false) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 10)
      .fillColor(bold ? '#0F172A' : '#475569')
      .text(label, totalsX, doc.y, { width: totalsLabelWidth, continued: false });
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 10)
      .fillColor('#0F172A')
      .text(value, totalsX + totalsLabelWidth, doc.y - (bold ? 13 : 12), {
        width: 100,
        align: 'right',
      });
  };

  totalsRow('Subtotal', money(order.subtotal));
  if (order.discountAmount > 0) {
    totalsRow('Discount', `-${money(order.discountAmount)}`);
  }
  totalsRow('Delivery Charge', money(order.deliveryCharge));
  if (order.taxAmount > 0) {
    totalsRow('Tax', money(order.taxAmount));
  }
  doc
    .moveTo(totalsX, doc.y + 2)
    .lineTo(TABLE_RIGHT_EDGE, doc.y + 2)
    .strokeColor('#CBD5E1')
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.5);
  totalsRow('Total', money(order.totalAmount), true);

  // ─── Payment ───────────────────────────────────────────────────────────
  const payment = order.payments[0];
  doc.moveDown(2);
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#475569')
    .text('PAYMENT', PAGE_MARGIN, doc.y);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#0F172A')
    .text(
      `Method: ${order.paymentMethod.replace(/_/g, ' ')}   ·   Status: ${
        payment ? payment.status.replace(/_/g, ' ') : order.paymentStatus.replace(/_/g, ' ')
      }${payment?.paidAt ? `   ·   Paid: ${formatDate(payment.paidAt)}` : ''}`,
    );

  // ─── Footer ────────────────────────────────────────────────────────────
  doc.moveDown(3);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#94A3B8')
    .text('Thank you for shopping with us.', PAGE_MARGIN, doc.y, {
      width: TABLE_RIGHT_EDGE - PAGE_MARGIN,
      align: 'center',
    });

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
