-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('SHIPPING', 'BILLING');

-- CreateTable
CREATE TABLE "addresses" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "label" VARCHAR(100),
    "type" "AddressType" NOT NULL DEFAULT 'SHIPPING',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "recipient_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "address_line" VARCHAR(255) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "region" VARCHAR(100) NOT NULL,
    "postal_code" VARCHAR(20) NOT NULL,
    "country" VARCHAR(100) NOT NULL DEFAULT 'Thailand',
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "addresses_sid_key" ON "addresses"("sid");

-- CreateIndex
CREATE INDEX "addresses_user_id_is_default_idx" ON "addresses"("user_id", "is_default");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
