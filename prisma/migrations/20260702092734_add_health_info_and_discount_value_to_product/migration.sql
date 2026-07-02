-- AlterTable
ALTER TABLE "products" ADD COLUMN     "discountValue" DECIMAL(12,2),
ADD COLUMN     "dosage" TEXT,
ADD COLUMN     "dosageTh" TEXT,
ADD COLUMN     "genericName" VARCHAR(255),
ADD COLUMN     "healthBenefits" TEXT,
ADD COLUMN     "healthBenefitsTh" TEXT,
ADD COLUMN     "ingredients" TEXT,
ADD COLUMN     "ingredientsTh" TEXT,
ADD COLUMN     "origin" VARCHAR(255),
ADD COLUMN     "storageInstructions" TEXT,
ADD COLUMN     "storageInstructionsTh" TEXT,
ADD COLUMN     "warning" TEXT,
ADD COLUMN     "warningTh" TEXT;
