-- CreateTable
CREATE TABLE "combo_products" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "titleTh" VARCHAR(255),
    "slug" VARCHAR(255) NOT NULL,
    "shortDescription" VARCHAR(500),
    "shortDescTh" VARCHAR(500),
    "description" TEXT,
    "descriptionTh" TEXT,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "comboPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "status" "CategoryProductStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "seoMetadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "combo_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_items" (
    "id" SERIAL NOT NULL,
    "combo_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "variant_id" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_images" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "thumbnailUrl" VARCHAR(512),
    "bannerUrl" VARCHAR(512),
    "iconUrl" VARCHAR(512),
    "altText" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "combo_id" INTEGER NOT NULL,

    CONSTRAINT "combo_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "batchNo" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER NOT NULL DEFAULT 0,
    "manufacturingDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" INTEGER,
    "variantId" INTEGER,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "combo_products_sid_key" ON "combo_products"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "combo_products_title_key" ON "combo_products"("title");

-- CreateIndex
CREATE UNIQUE INDEX "combo_products_slug_key" ON "combo_products"("slug");

-- CreateIndex
CREATE INDEX "combo_products_slug_idx" ON "combo_products"("slug");

-- CreateIndex
CREATE INDEX "combo_products_status_isFeatured_idx" ON "combo_products"("status", "isFeatured");

-- CreateIndex
CREATE INDEX "combo_products_starts_at_ends_at_idx" ON "combo_products"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "combo_items_product_id_idx" ON "combo_items"("product_id");

-- CreateIndex
CREATE INDEX "combo_items_variant_id_idx" ON "combo_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "combo_items_combo_id_product_id_variant_id_key" ON "combo_items"("combo_id", "product_id", "variant_id");

-- CreateIndex
CREATE INDEX "combo_images_combo_id_isPrimary_idx" ON "combo_images"("combo_id", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "batches_sid_key" ON "batches"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "batches_batchNo_key" ON "batches"("batchNo");

-- CreateIndex
CREATE INDEX "batches_productId_idx" ON "batches"("productId");

-- CreateIndex
CREATE INDEX "batches_variantId_idx" ON "batches"("variantId");

-- AddForeignKey
ALTER TABLE "combo_products" ADD CONSTRAINT "combo_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_products" ADD CONSTRAINT "combo_products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "combo_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_images" ADD CONSTRAINT "combo_images_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "combo_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
