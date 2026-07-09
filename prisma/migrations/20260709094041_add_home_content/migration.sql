-- CreateEnum
CREATE TYPE "HomeContentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HomeContentType" AS ENUM ('PROMOTION_BANNER', 'HERO_SLIDER', 'OVC');

-- CreateTable
CREATE TABLE "home_content" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "type" "HomeContentType" NOT NULL,
    "status" "HomeContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "heading" VARCHAR(255),
    "bodyText" TEXT,
    "headingTh" VARCHAR(255),
    "bodyTextTh" TEXT,
    "imageUrl" VARCHAR(512) NOT NULL,
    "videoUrl" VARCHAR(512),
    "redirectUrl" VARCHAR(512),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,

    CONSTRAINT "home_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_content_sid_key" ON "home_content"("sid");

-- CreateIndex
CREATE INDEX "home_content_type_status_displayOrder_idx" ON "home_content"("type", "status", "displayOrder");

-- AddForeignKey
ALTER TABLE "home_content" ADD CONSTRAINT "home_content_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_content" ADD CONSTRAINT "home_content_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
