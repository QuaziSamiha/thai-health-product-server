/*
  Warnings:

  - You are about to drop the column `costPerItem` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `discountPrice` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `product_variants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "costPerItem",
DROP COLUMN "discountPrice",
DROP COLUMN "price",
ADD COLUMN     "basePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "costPrice" DECIMAL(12,2),
ADD COLUMN     "discountValue" DECIMAL(12,2),
ADD COLUMN     "salePrice" DECIMAL(12,2);
