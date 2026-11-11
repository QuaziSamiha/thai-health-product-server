-- CreateEnum
CREATE TYPE "PartnerOptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartnerRequestStatus" AS ENUM ('PENDING', 'CONTACTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "partner_types" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "PartnerOptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_countries" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "PartnerOptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_requests" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "message" TEXT,
    "partner_type_id" INTEGER NOT NULL,
    "partner_country_id" INTEGER NOT NULL,
    "status" "PartnerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_types_sid_key" ON "partner_types"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "partner_types_name_key" ON "partner_types"("name");

-- CreateIndex
CREATE INDEX "partner_types_status_idx" ON "partner_types"("status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_countries_sid_key" ON "partner_countries"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "partner_countries_name_key" ON "partner_countries"("name");

-- CreateIndex
CREATE INDEX "partner_countries_status_idx" ON "partner_countries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_requests_sid_key" ON "partner_requests"("sid");

-- CreateIndex
CREATE INDEX "partner_requests_status_created_at_idx" ON "partner_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "partner_requests_partner_type_id_idx" ON "partner_requests"("partner_type_id");

-- CreateIndex
CREATE INDEX "partner_requests_partner_country_id_idx" ON "partner_requests"("partner_country_id");

-- AddForeignKey
ALTER TABLE "partner_types" ADD CONSTRAINT "partner_types_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_types" ADD CONSTRAINT "partner_types_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_countries" ADD CONSTRAINT "partner_countries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_countries" ADD CONSTRAINT "partner_countries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_partner_type_id_fkey" FOREIGN KEY ("partner_type_id") REFERENCES "partner_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_partner_country_id_fkey" FOREIGN KEY ("partner_country_id") REFERENCES "partner_countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

