/**
 * One-off backfill: resyncs Product.basePrice/discountType/discountValue/
 * salePrice for every VARIABLE product from its own default variant.
 *
 * Needed because, before the fix in product.service.ts (createProduct's
 * discount derivation + resolveStockUpdate's VARIABLE branch), these columns
 * were only ever updated when a caller happened to also send a redundant
 * top-level `basePrice` alongside `variants` — so existing VARIABLE products
 * can carry a stale snapshot that no longer matches what their default
 * variant actually shows on the storefront. That snapshot is exactly what
 * price-based sorting (`sortBy=basePrice`) keys off, so a stale one makes
 * "sort by price" look scrambled relative to the prices actually displayed.
 *
 * Run once from the server package root (builds first since the generated
 * Prisma client's internal imports need real compiled .js files — ts-node
 * can't resolve them directly):
 *   yarn build
 *   NODE_ENV=development node dist/scripts/backfill-variable-product-pricing.js
 *
 * (swap NODE_ENV for whichever environment you're targeting — production,
 * office, etc. — matching one of the .env.<NODE_ENV>[.local] files below.)
 */
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  DiscountType,
  ProductType,
} from '../src/generated/prisma/client';

//* SAME CASCADE/PRECEDENCE AS prisma.config.ts — DOTENV NEVER OVERWRITES A
//* VAR ALREADY SET, SO THE FIRST MATCH WINS: PERSONAL/GITIGNORED OVERRIDES,
//* THEN THE SHARED PER-ENVIRONMENT FILE, THEN THE GENERIC FALLBACK.
const nodeEnv = process.env.NODE_ENV || 'development';
loadEnv({ path: `.env.${nodeEnv}.local` });
loadEnv({ path: `.env.${nodeEnv}` });
loadEnv({ path: '.env' });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

//* SAME LOGIC AS ProductService.resolveSalePrice — DUPLICATED HERE RATHER
//* THAN IMPORTED SINCE ProductService IS A NEST-INJECTABLE WIRED THROUGH THE
//* APP'S DI CONTAINER, WHICH THIS STANDALONE SCRIPT DELIBERATELY DOESN'T BOOT.
function resolveSalePrice(
  basePrice: number,
  discountType: DiscountType | undefined,
  discountValue: number | undefined,
): { discountType: DiscountType; discountValue: number | null; salePrice: number } {
  const effectiveType = discountType ?? DiscountType.PERCENTAGE;

  if (discountValue === undefined) {
    return { discountType: effectiveType, discountValue: null, salePrice: basePrice };
  }

  const salePrice =
    effectiveType === DiscountType.PERCENTAGE
      ? basePrice * (1 - discountValue / 100)
      : basePrice - discountValue;

  return {
    discountType: effectiveType,
    discountValue,
    salePrice: Math.round(salePrice * 100) / 100,
  };
}

async function main() {
  const products = await prisma.product.findMany({
    where: { type: ProductType.VARIABLE, deletedAt: null },
    select: {
      id: true,
      name: true,
      basePrice: true,
      discountType: true,
      discountValue: true,
      salePrice: true,
      variants: {
        select: {
          basePrice: true,
          discountType: true,
          discountValue: true,
          isDefault: true,
        },
      },
    },
  });

  let updated = 0;
  let skippedNoVariants = 0;

  for (const product of products) {
    if (product.variants.length === 0) {
      skippedNoVariants++;
      continue;
    }

    const defaultVariant =
      product.variants.find((v) => v.isDefault) ?? product.variants[0];

    const basePrice = Number(defaultVariant.basePrice);
    const discountValueInput =
      defaultVariant.discountValue === null
        ? undefined
        : Number(defaultVariant.discountValue);
    const { discountType, discountValue, salePrice } = resolveSalePrice(
      basePrice,
      defaultVariant.discountType,
      discountValueInput,
    );

    const currentBasePrice = Number(product.basePrice);
    const currentDiscountValue =
      product.discountValue === null ? null : Number(product.discountValue);
    const currentSalePrice = Number(product.salePrice);

    const needsUpdate =
      currentBasePrice !== basePrice ||
      product.discountType !== discountType ||
      currentDiscountValue !== discountValue ||
      currentSalePrice !== salePrice;

    if (!needsUpdate) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: { basePrice, discountType, discountValue, salePrice },
    });
    updated++;
    console.log(
      `Updated "${product.name}" (#${product.id}): ` +
        `basePrice ${currentBasePrice} -> ${basePrice}, ` +
        `salePrice ${currentSalePrice} -> ${salePrice}`,
    );
  }

  console.log(
    `Done. ${updated}/${products.length} VARIABLE product(s) updated` +
      (skippedNoVariants
        ? ` (${skippedNoVariants} skipped — VARIABLE with no variants).`
        : '.'),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
