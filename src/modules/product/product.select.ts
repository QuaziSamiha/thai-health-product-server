//* ═══════════════════════════════════════════════════════════════════════
//* PRODUCT SELECT SHAPES — PRISMA PROJECTIONS FOR EACH ROLE-BASED RESPONSE.
//* KEEP EACH ONE IN SYNC WITH THE DTO CONSTRUCTOR IT FEEDS
//* (see src/modules/product/dto/*.dto.ts).
//* ═══════════════════════════════════════════════════════════════════════

//* SUB-SELECTS — SHARED BUILDING BLOCKS FOR THE ROLE-BASED SELECTS BELOW

//* MATCHES ProductCategoryMinifiedDto (dto/product-shared.dto.ts)
export const CATEGORY_MINIFIED_SELECT = {
  id: true,
  name: true,
  slug: true,
} as const;

//* MATCHES ProductImageDto — NO SENSITIVE FIELDS, SAME SHAPE FOR EVERY ROLE
export const IMAGE_SELECT = {
  id: true,
  url: true,
  thumbnailUrl: true,
  bannerUrl: true,
  iconUrl: true,
  altText: true,
  displayOrder: true,
  isPrimary: true,
  isActive: true,
  variantId: true,
} as const;

//* MATCHES UserMinifiedResponseDto / MinifiedUser (user/dto/user-response.dto.ts)
export const USER_MINIFIED_SELECT = {
  id: true,
  email: true,
  status: true,
  role: true,
  profile: {
    select: { name: true },
  },
} as const;

//* FIELDS SHARED BY BOTH VARIANT SELECTS BELOW
const VARIANT_SELECT_COMMON = {
  id: true,
  name: true,
  slug: true,
  description: true,
  shortDescription: true,
  nameTh: true,
  descriptionTh: true,
  shortDescTh: true,
  sku: true,
  stockStatus: true,
  weight: true,
  size: true,
  price: true,
  discountPrice: true,
  attributes: true,
  isDefault: true,
} as const;

//* MATCHES ProductVariantDto (admin) — adds barcode/quantity/discountType/costPerItem
export const VARIANT_SELECT_ADMIN = {
  ...VARIANT_SELECT_COMMON,
  barcode: true,
  quantity: true,
  discountType: true,
  costPerItem: true,
} as const;

//* MATCHES ProductVariantPublicDto — excludes barcode/costPerItem/quantity/discountType
export const VARIANT_SELECT_PUBLIC = VARIANT_SELECT_COMMON;

//* ═══════════════════════════════════════════════════════════════════════
//* ROLE-BASED PRODUCT SELECTS
//* ═══════════════════════════════════════════════════════════════════════

//* FIELDS SHARED BY BOTH PRODUCT SELECTS BELOW. `variants` is deliberately
//* excluded here — it needs a different nested select per role, so each
//* select below adds it explicitly.
const PRODUCT_SELECT_COMMON = {
  id: true,
  sid: true,
  name: true,
  slug: true,
  sku: true,
  description: true,
  shortDescription: true,
  nameTh: true,
  descriptionTh: true,
  shortDescTh: true,
  type: true,
  isFeatured: true,
  hasVariants: true,
  basePrice: true,
  salePrice: true,
  stockStatus: true,
  weight: true,
  dimensions: true,
  seoMetadata: true,
  tags: true,
  dosage: true,
  dosageTh: true,
  ingredients: true,
  ingredientsTh: true,
  healthBenefits: true,
  healthBenefitsTh: true,
  warning: true,
  warningTh: true,
  storageInstructions: true,
  storageInstructionsTh: true,
  origin: true,
  genericName: true,
  category: { select: CATEGORY_MINIFIED_SELECT },
  images: { select: IMAGE_SELECT },
  publishedAt: true,
} as const;

//* ADMIN — feeds ProductResponseDto. Adds cost/margin fields, raw FKs,
//* soft-delete state, and the full created/updated/deleted-by audit trail.
//* Never reuse this select for a public/unauthenticated route.
export const PRODUCT_SELECT_ADMIN = {
  ...PRODUCT_SELECT_COMMON,
  barcode: true,
  status: true,
  discountType: true,
  discountValue: true,
  costPrice: true,
  quantity: true,
  totalStock: true,
  categoryId: true,
  variants: { select: VARIANT_SELECT_ADMIN },
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  createdByUser: { select: USER_MINIFIED_SELECT },
  updatedBy: true,
  updatedByUser: { select: USER_MINIFIED_SELECT },
  deletedBy: true,
  deletedByUser: { select: USER_MINIFIED_SELECT },
} as const;

//* PUBLIC — feeds ProductResponsePublicDto. Storefront/PDP view: no
//* cost/margin data, no raw FKs/audit trail, no exact stock counts
//* (stockStatus only). Health/compliance labeling fields ARE included.
export const PRODUCT_SELECT_PUBLIC = {
  ...PRODUCT_SELECT_COMMON,
  variants: { select: VARIANT_SELECT_PUBLIC },
} as const;

//* MINIFIED — feeds ProductMinifiedResponseDto. Cart items, order lines,
//* wishlist, related-products widgets, search autocomplete. Deliberately
//* cheap: no relations joined, no reuse of the COMMON shape above.
//* `thumbnailUrl` on the DTO is populated by the caller (e.g. from a
//* separate primary-image lookup), not by this select — keep it that way
//* so this stays a single indexed row read.
export const PRODUCT_SELECT_MINIFIED = {
  id: true,
  sid: true,
  name: true,
  slug: true,
  basePrice: true,
  salePrice: true,
  stockStatus: true,
} as const;
