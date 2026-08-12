import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
const { Pool } = pkg;

const SUPER_ADMIN_EMAIL = 'mahfuzislam1695@gmail.com';
const DATA_FILE = path.join(__dirname, 'seed-data', 'products.json');

interface SourceCategory {
  id: number;
  status: string;
  name: string;
  slug: string;
  description: string | null;
  nameTh: string | null;
  descriptionTh: string | null;
  parentId: number | null;
  level: number;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  iconUrl: string | null;
  displayOrder: number;
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaTitleTh: string | null;
  metaDescriptionTh: string | null;
}

interface SourceImage {
  url: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  iconUrl: string | null;
  altText: string | null;
  displayOrder: number;
  isPrimary: boolean;
  isActive: boolean;
}

interface SourceVariant {
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  nameTh: string | null;
  descriptionTh: string | null;
  shortDescTh: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  stockStatus: string;
  weight: number | null;
  size: string | null;
  price: number; //* NOTE: source calls this "price", schema field is basePrice
  discountType: string;
  discountValue: number | null;
  salePrice: number;
  costPerItem: number | null; //* NOTE: source calls this "costPerItem", schema field is costPrice
  attributes: Record<string, unknown>;
  isDefault: boolean;
}

interface SourceProduct {
  name: string;
  slug: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  shortDescription: string | null;
  nameTh: string | null;
  descriptionTh: string | null;
  shortDescTh: string | null;
  type: string;
  status: string;
  isFeatured: boolean;
  hasVariants: boolean;
  basePrice: number;
  discountType: string;
  discountValue: number | null;
  salePrice: number;
  costPrice: number | null;
  quantity: number;
  totalStock: number;
  stockStatus: string;
  weight: number | null;
  dimensions: Record<string, unknown>;
  seoMetadata: Record<string, unknown>;
  tags: string[];
  dosage: string | null;
  dosageTh: string | null;
  ingredients: string | null;
  ingredientsTh: string | null;
  healthBenefits: string | null;
  healthBenefitsTh: string | null;
  warning: string | null;
  warningTh: string | null;
  storageInstructions: string | null;
  storageInstructionsTh: string | null;
  origin: string | null;
  genericName: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  category: SourceCategory;
  images: SourceImage[];
  variants: SourceVariant[];
}

function loadProducts(): SourceProduct[] {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(
      `Seed data file not found at ${DATA_FILE}. Save the complete product JSON export there before running this script.`,
    );
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as SourceProduct[];
}

async function upsertCategories(
  prisma: PrismaClient,
  products: SourceProduct[],
  attributedUserId: number,
): Promise<Map<number, number>> {
  //* DEDUP EVERY NESTED CATEGORY BY ITS SOURCE ID
  const bySourceId = new Map<number, SourceCategory>();
  for (const product of products) {
    bySourceId.set(product.category.id, product.category);
  }

  //* PASS 1 — UPSERT EACH CATEGORY BY SLUG, WITHOUT parentId
  const sourceIdToTargetId = new Map<number, number>();
  for (const category of bySourceId.values()) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        status: category.status as Prisma.CategoryUpdateInput['status'],
        name: category.name,
        description: category.description,
        nameTh: category.nameTh,
        descriptionTh: category.descriptionTh,
        level: category.level,
        thumbnailUrl: category.thumbnailUrl,
        bannerUrl: category.bannerUrl,
        iconUrl: category.iconUrl,
        displayOrder: category.displayOrder,
        isFeatured: category.isFeatured,
        metaTitle: category.metaTitle,
        metaDescription: category.metaDescription,
        metaTitleTh: category.metaTitleTh,
        metaDescriptionTh: category.metaDescriptionTh,
        updatedByUser: { connect: { id: attributedUserId } },
      },
      create: {
        status: category.status as Prisma.CategoryCreateInput['status'],
        name: category.name,
        slug: category.slug,
        description: category.description,
        nameTh: category.nameTh,
        descriptionTh: category.descriptionTh,
        level: category.level,
        thumbnailUrl: category.thumbnailUrl,
        bannerUrl: category.bannerUrl,
        iconUrl: category.iconUrl,
        displayOrder: category.displayOrder,
        isFeatured: category.isFeatured,
        metaTitle: category.metaTitle,
        metaDescription: category.metaDescription,
        metaTitleTh: category.metaTitleTh,
        metaDescriptionTh: category.metaDescriptionTh,
        createdByUser: { connect: { id: attributedUserId } },
        updatedByUser: { connect: { id: attributedUserId } },
      },
    });
    sourceIdToTargetId.set(category.id, row.id);
  }

  //* PASS 2 — RESOLVE parentId WHERE THE PARENT WAS ALSO PRESENT IN THE SOURCE DATA
  for (const category of bySourceId.values()) {
    if (category.parentId === null) continue;

    const targetParentId = sourceIdToTargetId.get(category.parentId);
    if (targetParentId === undefined) {
      console.warn(
        `Category "${category.name}" (slug: ${category.slug}) references parentId=${category.parentId}, ` +
          'but no matching category data was found in the source file — left unparented.',
      );
      continue;
    }

    const targetId = sourceIdToTargetId.get(category.id) as number;
    await prisma.category.update({
      where: { id: targetId },
      data: { parent: { connect: { id: targetParentId } } },
    });
  }

  return sourceIdToTargetId;
}

async function upsertProduct(
  prisma: PrismaClient,
  product: SourceProduct,
  categoryId: number,
  attributedUserId: number,
): Promise<void> {
  const scalarFields = {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    shortDescription: product.shortDescription,
    nameTh: product.nameTh,
    descriptionTh: product.descriptionTh,
    shortDescTh: product.shortDescTh,
    type: product.type as Prisma.ProductCreateInput['type'],
    status: product.status as Prisma.ProductCreateInput['status'],
    isFeatured: product.isFeatured,
    hasVariants: product.hasVariants,
    basePrice: product.basePrice,
    discountType:
      product.discountType as Prisma.ProductCreateInput['discountType'],
    discountValue: product.discountValue,
    //* salePrice IS SERVER-DERIVED (basePrice + discountType/discountValue) — NEVER SET DIRECTLY, SEE schema/product.prisma
    costPrice: product.costPrice,
    quantity: product.quantity,
    totalStock: product.totalStock,
    stockStatus:
      product.stockStatus as Prisma.ProductCreateInput['stockStatus'],
    weight: product.weight,
    dimensions: product.dimensions as Prisma.InputJsonValue,
    seoMetadata: product.seoMetadata as Prisma.InputJsonValue,
    tags: product.tags,
    dosage: product.dosage,
    dosageTh: product.dosageTh,
    ingredients: product.ingredients,
    ingredientsTh: product.ingredientsTh,
    healthBenefits: product.healthBenefits,
    healthBenefitsTh: product.healthBenefitsTh,
    warning: product.warning,
    warningTh: product.warningTh,
    storageInstructions: product.storageInstructions,
    storageInstructionsTh: product.storageInstructionsTh,
    origin: product.origin,
    genericName: product.genericName,
    publishedAt: product.publishedAt ? new Date(product.publishedAt) : null,
  };

  const row = await prisma.product.upsert({
    where: { slug: product.slug },
    update: {
      ...scalarFields,
      category: { connect: { id: categoryId } },
      updatedByUser: { connect: { id: attributedUserId } },
    },
    create: {
      ...scalarFields,
      slug: product.slug,
      category: { connect: { id: categoryId } },
      createdByUser: { connect: { id: attributedUserId } },
      updatedByUser: { connect: { id: attributedUserId } },
    },
  });

  //* IMAGES HAVE NO NATURAL UNIQUE KEY — DELETE + RECREATE KEEPS RERUNS IDEMPOTENT
  await prisma.productImage.deleteMany({ where: { productId: row.id } });
  if (product.images.length > 0) {
    await prisma.productImage.createMany({
      data: product.images.map((image) => ({
        url: image.url,
        thumbnailUrl: image.thumbnailUrl,
        bannerUrl: image.bannerUrl,
        iconUrl: image.iconUrl,
        altText: image.altText,
        displayOrder: image.displayOrder,
        isPrimary: image.isPrimary,
        isActive: image.isActive,
        productId: row.id,
      })),
    });
  }

  for (const variant of product.variants) {
    await prisma.productVariant.upsert({
      where: { slug: variant.slug },
      update: {
        name: variant.name,
        description: variant.description,
        shortDescription: variant.shortDescription,
        nameTh: variant.nameTh,
        descriptionTh: variant.descriptionTh,
        shortDescTh: variant.shortDescTh,
        sku: variant.sku || null,
        barcode: variant.barcode || null,
        quantity: variant.quantity,
        stockStatus:
          variant.stockStatus as Prisma.ProductVariantUpdateInput['stockStatus'],
        weight: variant.weight,
        size: variant.size,
        costPrice: variant.costPerItem,
        discountType:
          variant.discountType as Prisma.ProductVariantUpdateInput['discountType'],
        discountValue: variant.discountValue,
        basePrice: variant.price,
        //* salePrice IS SERVER-DERIVED — NEVER SET DIRECTLY, SEE schema/product.prisma
        attributes: variant.attributes as Prisma.InputJsonValue,
        isDefault: variant.isDefault,
        product: { connect: { id: row.id } },
      },
      create: {
        name: variant.name,
        slug: variant.slug,
        description: variant.description,
        shortDescription: variant.shortDescription,
        nameTh: variant.nameTh,
        descriptionTh: variant.descriptionTh,
        shortDescTh: variant.shortDescTh,
        sku: variant.sku || null,
        barcode: variant.barcode || null,
        quantity: variant.quantity,
        stockStatus:
          variant.stockStatus as Prisma.ProductVariantCreateInput['stockStatus'],
        weight: variant.weight,
        size: variant.size,
        costPrice: variant.costPerItem,
        discountType:
          variant.discountType as Prisma.ProductVariantCreateInput['discountType'],
        discountValue: variant.discountValue,
        basePrice: variant.price,
        //* salePrice IS SERVER-DERIVED — NEVER SET DIRECTLY, SEE schema/product.prisma
        attributes: variant.attributes as Prisma.InputJsonValue,
        isDefault: variant.isDefault,
        product: { connect: { id: row.id } },
      },
    });
  }

  console.log(
    `Seeded product: ${product.name} (${product.images.length} image(s), ${product.variants.length} variant(s))`,
  );
}

async function main() {
  const products = loadProducts().filter((p) => p.deletedAt === null);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  const prisma = new PrismaClient({ adapter });

  try {
    const superAdmin = await prisma.user.findUniqueOrThrow({
      where: { email: SUPER_ADMIN_EMAIL },
    });

    const categoryIds = await upsertCategories(prisma, products, superAdmin.id);

    for (const product of products) {
      const categoryId = categoryIds.get(product.category.id) as number;
      await upsertProduct(prisma, product, categoryId, superAdmin.id);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Product seed failed:', error);
  process.exit(1);
});
