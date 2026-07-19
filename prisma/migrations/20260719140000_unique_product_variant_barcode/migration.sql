-- ProductVariant.barcode had no uniqueness constraint even though Product.barcode
-- does, and a barcode is scanned against the sellable SKU (the variant), not the
-- parent product. Verified no duplicate non-null barcodes exist in
-- product_variants before adding this.
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "public"."product_variants"("barcode");
