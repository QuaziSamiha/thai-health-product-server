//* ONE PLACE FOR EVERY COLOUR/METRIC THE INVOICE DRAWS WITH. THE PALETTE
//* MIRRORS THE STOREFRONT THEME (src/styles/globals.css ON THE CLIENT):
//* NAVY --color-navyBlue, LIME --color-primary-500/700, SLATE NEUTRALS.
export const INK = {
  navy: '#211D70',
  navySoft: '#3A3596',
  lime: '#A6CE39',
  limeDeep: '#769228',
  heading: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  hairline: '#F1F5F9',
  panel: '#F8FAFC',
  zebra: '#FBFCFE',
  white: '#FFFFFF',
  onNavy: '#CFCDEC',
  successBg: '#DCFCE7',
  successFg: '#15803D',
  warnBg: '#FEF3C7',
  warnFg: '#B45309',
  dangerBg: '#FEE2E2',
  dangerFg: '#B91C1C',
  infoBg: '#E0F2FE',
  infoFg: '#0369A1',
};

export const FONT = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  oblique: 'Helvetica-Oblique',
};

//* A4 IS 595.28 x 841.89pt. THE HEADER BAND IS DRAWN EDGE-TO-EDGE, SO THE
//* PAGE IS CREATED WITH margin: 0 AND EVERY BLOCK POSITIONS ITSELF AGAINST
//* THESE CONSTANTS INSTEAD OF RELYING ON PDFKit'S FLOWING doc.y CURSOR.
export const PAGE = {
  width: 595.28,
  height: 841.89,
  left: 48,
  right: 547.28,
  bodyTop: 150,
  bodyBottom: 762,
  footerLine: 782,
};

export const CONTENT_WIDTH = PAGE.right - PAGE.left;
