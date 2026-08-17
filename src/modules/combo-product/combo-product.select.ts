//* ═══════════════════════════════════════════════════════════════════════
//* COMBO PRODUCT SELECT SHAPES — PRISMA PROJECTIONS FOR EACH ROLE-BASED
//* RESPONSE. KEEP EACH ONE IN SYNC WITH THE DTO CONSTRUCTOR IT FEEDS
//* (see src/modules/combo-product/dto/*.dto.ts).
//* ═══════════════════════════════════════════════════════════════════════

//* SUB-SELECTS — SHARED BUILDING BLOCKS FOR THE ROLE-BASED SELECTS BELOW

//* MATCHES ComboItemProductResponseDto (dto/combo-item-response.dto.ts).
//* NO `id` — THE OWNING ComboItemResponseDto ALREADY EXPOSES IT AS `productId`.
export const COMBO_ITEM_PRODUCT_SELECT = {
  name: true,
  slug: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  images: { select: { url: true, isPrimary: true } },
} as const;

//* MATCHES ComboItemVariantResponseDto — basePrice/salePrice, NOT quantity/
//* cost/discount admin internals, SINCE THIS IS EMBEDDED IN BOTH THE ADMIN
//* AND PUBLIC COMBO RESPONSE. NO `id` — SEE COMBO_ITEM_PRODUCT_SELECT NOTE ABOVE.
export const COMBO_ITEM_VARIANT_SELECT = {
  name: true,
  slug: true,
  size: true,
  basePrice: true,
  salePrice: true,
} as const;

//* MATCHES ComboItemResponseDto — SAME SHAPE FOR EVERY ROLE, NO SENSITIVE FIELDS
export const COMBO_ITEM_SELECT = {
  id: true,
  productId: true,
  variantId: true,
  quantity: true,
  unitPrice: true,
  displayOrder: true,
  product: { select: COMBO_ITEM_PRODUCT_SELECT },
  variant: { select: COMBO_ITEM_VARIANT_SELECT },
} as const;

//* MATCHES ComboImageResponseDto — NO SENSITIVE FIELDS, SAME SHAPE FOR EVERY ROLE
export const COMBO_IMAGE_SELECT = {
  id: true,
  url: true,
  thumbnailUrl: true,
  bannerUrl: true,
  iconUrl: true,
  altText: true,
  displayOrder: true,
  isPrimary: true,
  isActive: true,
} as const;

//* MATCHES UserMinifiedResponseDto / MinifiedUser (user/dto/user-response.dto.ts)
const COMBO_USER_MINIFIED_SELECT = {
  id: true,
  email: true,
  status: true,
  role: true,
  profile: { select: { firstName: true, lastName: true } },
} as const;

//* ═══════════════════════════════════════════════════════════════════════
//* ROLE-BASED COMBO PRODUCT SELECTS
//* ═══════════════════════════════════════════════════════════════════════

//* FIELDS SHARED BY BOTH SELECTS BELOW. `items`/`images` NEED NO ROLE
//* VARIATION (UNLIKE PRODUCT'S `variants`) — THE NESTED SELECTS ABOVE ARE
//* ALREADY FREE OF ADMIN-ONLY FIELDS.
const COMBO_PRODUCT_SELECT_COMMON = {
  id: true,
  sid: true,
  title: true,
  titleTh: true,
  slug: true,
  //* sku IS PUBLIC (SAME TIER AS PRODUCT_SELECT_COMMON) — CUSTOMERS QUOTE IT IN
  //* SUPPORT TICKETS. barcode/costPrice ARE ADMIN-ONLY, SEE BELOW.
  sku: true,
  shortDescription: true,
  shortDescTh: true,
  description: true,
  descriptionTh: true,
  totalPrice: true,
  comboPrice: true,
  startsAt: true,
  endsAt: true,
  isFeatured: true,
  //* DERIVED AVAILABILITY — ONE COLUMN INSTEAD OF JOINING items →
  //* products/variants AND AGGREGATING PER CARD. `quantity` IS ADMIN-ONLY,
  //* MATCHING PRODUCT_SELECT_PUBLIC, WHICH EXPOSES stockStatus BUT NOT THE
  //* RAW COUNT.
  stockStatus: true,
  seoMetadata: true,
  images: { select: COMBO_IMAGE_SELECT, orderBy: { displayOrder: 'asc' } },
  items: { select: COMBO_ITEM_SELECT, orderBy: { displayOrder: 'asc' } },
  publishedAt: true,
} as const;

//* ADMIN — feeds ComboProductResponseDto. Adds raw workflow `status`,
//* soft-delete state, and the full created/updated-by audit trail. Never
//* reuse this select for a public/unauthenticated route.
export const COMBO_PRODUCT_SELECT_ADMIN = {
  ...COMBO_PRODUCT_SELECT_COMMON,
  status: true,
  barcode: true,
  costPrice: true,
  quantity: true,
  lowStockThreshold: true,
  offeredQuantity: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  createdByUser: { select: COMBO_USER_MINIFIED_SELECT },
  updatedBy: true,
  updatedByUser: { select: COMBO_USER_MINIFIED_SELECT },
  deletedBy: true,
  deletedByUser: { select: COMBO_USER_MINIFIED_SELECT },
} as const;

//* PUBLIC — feeds ComboProductResponsePublicDto. Storefront view: no
//* `status`, no audit trail, no raw timestamps other than `publishedAt`.
export const COMBO_PRODUCT_SELECT_PUBLIC = {
  ...COMBO_PRODUCT_SELECT_COMMON,
} as const;
