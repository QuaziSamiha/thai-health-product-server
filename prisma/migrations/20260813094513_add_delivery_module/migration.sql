-- CreateEnum
CREATE TYPE "DeliveryVehicleType" AS ENUM ('BICYCLE', 'MOTORCYCLE', 'CAR', 'VAN', 'ON_FOOT');

-- CreateEnum
CREATE TYPE "DeliveryAvailability" AS ENUM ('AVAILABLE', 'ON_DELIVERY', 'OFFLINE', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "DeliveryEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'GIG');

-- CreateEnum
CREATE TYPE "NidVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryEntityStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DeliveryIntegrationType" AS ENUM ('MANUAL', 'API', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "DeliveryPricingModel" AS ENUM ('FLAT', 'WEIGHT_BASED', 'DISTANCE_BASED');

-- CreateEnum
CREATE TYPE "DeliveryShipmentStatus" AS ENUM ('PENDING', 'BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_ATTEMPT', 'RETURNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "delivery_man_profiles" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "nid_number" VARCHAR(13),
    "nid_document_url" TEXT,
    "nid_verification_status" "NidVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "nid_verified_at" TIMESTAMPTZ(3),
    "vehicle_type" "DeliveryVehicleType",
    "vehicle_registration_no" VARCHAR(50),
    "driving_license_no" VARCHAR(50),
    "availability" "DeliveryAvailability" NOT NULL DEFAULT 'OFFLINE',
    "coverage_area" VARCHAR(255),
    "employment_type" "DeliveryEmploymentType",
    "joined_at" TIMESTAMPTZ(3),
    "cod_collection_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cod_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank_name" VARCHAR(100),
    "bank_account_name" VARCHAR(200),
    "bank_account_number" VARCHAR(50),
    "completed_delivery_count" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(3,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "nid_verified_by" INTEGER,

    CONSTRAINT "delivery_man_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_providers" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "status" "DeliveryEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "integration_type" "DeliveryIntegrationType" NOT NULL DEFAULT 'MANUAL',
    "logo_url" VARCHAR(512),
    "contact_person" VARCHAR(150),
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "office_location" VARCHAR(255),
    "api_base_url" VARCHAR(255),
    "api_credential_ref" VARCHAR(255),
    "tracking_url_template" VARCHAR(512),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,

    CONSTRAINT "delivery_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "service_name" VARCHAR(100),
    "area_name" VARCHAR(150) NOT NULL,
    "state" VARCHAR(100),
    "region" VARCHAR(100),
    "postal_code_prefix" VARCHAR(10),
    "country" VARCHAR(100) NOT NULL DEFAULT 'Thailand',
    "min_delivery_days" INTEGER NOT NULL,
    "max_delivery_days" INTEGER NOT NULL,
    "pricing_model" "DeliveryPricingModel" NOT NULL DEFAULT 'FLAT',
    "base_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cod_available" BOOLEAN NOT NULL DEFAULT false,
    "cod_fee_percent" DECIMAL(5,2),
    "status" "DeliveryEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "provider_id" INTEGER NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_shipments" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "order_id" INTEGER NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "status" "DeliveryShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "tracking_number" VARCHAR(100),
    "tracking_url" VARCHAR(512),
    "provider_name_snapshot" VARCHAR(150) NOT NULL,
    "shipping_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimated_delivery_from" TIMESTAMPTZ(3),
    "estimated_delivery_to" TIMESTAMPTZ(3),
    "picked_up_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "provider_response" JSONB DEFAULT '{}',
    "provider_id" INTEGER NOT NULL,
    "zone_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "createdBy" INTEGER,

    CONSTRAINT "delivery_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_status_history" (
    "id" SERIAL NOT NULL,
    "status" "DeliveryShipmentStatus" NOT NULL,
    "note" TEXT,
    "shipment_id" INTEGER NOT NULL,
    "changed_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_man_profiles_sid_key" ON "delivery_man_profiles"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_man_profiles_nid_number_key" ON "delivery_man_profiles"("nid_number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_man_profiles_user_id_key" ON "delivery_man_profiles"("user_id");

-- CreateIndex
CREATE INDEX "delivery_man_profiles_availability_idx" ON "delivery_man_profiles"("availability");

-- CreateIndex
CREATE INDEX "delivery_man_profiles_nid_verification_status_idx" ON "delivery_man_profiles"("nid_verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_providers_sid_key" ON "delivery_providers"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_providers_name_key" ON "delivery_providers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_providers_slug_key" ON "delivery_providers"("slug");

-- CreateIndex
CREATE INDEX "delivery_providers_status_idx" ON "delivery_providers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_sid_key" ON "delivery_zones"("sid");

-- CreateIndex
CREATE INDEX "delivery_zones_provider_id_idx" ON "delivery_zones"("provider_id");

-- CreateIndex
CREATE INDEX "delivery_zones_area_name_idx" ON "delivery_zones"("area_name");

-- CreateIndex
CREATE INDEX "delivery_zones_state_region_idx" ON "delivery_zones"("state", "region");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_provider_id_area_name_min_delivery_days_max__key" ON "delivery_zones"("provider_id", "area_name", "min_delivery_days", "max_delivery_days");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_shipments_sid_key" ON "delivery_shipments"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_shipments_order_id_key" ON "delivery_shipments"("order_id");

-- CreateIndex
CREATE INDEX "delivery_shipments_order_id_idx" ON "delivery_shipments"("order_id");

-- CreateIndex
CREATE INDEX "delivery_shipments_provider_id_idx" ON "delivery_shipments"("provider_id");

-- CreateIndex
CREATE INDEX "delivery_shipments_zone_id_idx" ON "delivery_shipments"("zone_id");

-- CreateIndex
CREATE INDEX "delivery_shipments_status_idx" ON "delivery_shipments"("status");

-- CreateIndex
CREATE INDEX "delivery_shipments_tracking_number_idx" ON "delivery_shipments"("tracking_number");

-- CreateIndex
CREATE INDEX "delivery_status_history_shipment_id_created_at_idx" ON "delivery_status_history"("shipment_id", "created_at");

-- AddForeignKey
ALTER TABLE "delivery_man_profiles" ADD CONSTRAINT "delivery_man_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_man_profiles" ADD CONSTRAINT "delivery_man_profiles_nid_verified_by_fkey" FOREIGN KEY ("nid_verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_providers" ADD CONSTRAINT "delivery_providers_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_providers" ADD CONSTRAINT "delivery_providers_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "delivery_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_shipments" ADD CONSTRAINT "delivery_shipments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "delivery_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_shipments" ADD CONSTRAINT "delivery_shipments_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_shipments" ADD CONSTRAINT "delivery_shipments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "delivery_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
