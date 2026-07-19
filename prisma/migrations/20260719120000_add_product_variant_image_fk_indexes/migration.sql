-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_productId_isDefault_idx" ON "product_variants"("productId", "isDefault");

-- CreateIndex
CREATE INDEX "product_images_variantId_idx" ON "product_images"("variantId");
