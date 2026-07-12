-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DRAFT');

-- CreateEnum
CREATE TYPE "SupportType" AS ENUM ('DELIVERY_POLICY', 'TERMS_AND_CONDITIONS', 'PRIVACY_POLICY', 'CANCELLATION_POLICY', 'RETURN_POLICY', 'OTHERS');

-- CreateTable
CREATE TABLE "support_pages" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "type" "SupportType" NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "note" TEXT,
    "titleTh" VARCHAR(255),
    "contentTh" TEXT,
    "noteTh" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,

    CONSTRAINT "support_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_pages_sid_key" ON "support_pages"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "support_pages_slug_key" ON "support_pages"("slug");

-- CreateIndex
CREATE INDEX "support_pages_slug_idx" ON "support_pages"("slug");

-- CreateIndex
CREATE INDEX "support_pages_type_status_idx" ON "support_pages"("type", "status");

-- AddForeignKey
ALTER TABLE "support_pages" ADD CONSTRAINT "support_pages_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_pages" ADD CONSTRAINT "support_pages_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
