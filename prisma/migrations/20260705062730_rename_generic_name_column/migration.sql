/*
  Warnings:

  - You are about to drop the column `genericName` on the `products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "products" DROP COLUMN "genericName",
ADD COLUMN     "generic" VARCHAR(255);
