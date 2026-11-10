-- CreateEnum
CREATE TYPE "NewsEventStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DRAFT');


-- CreateTable
CREATE TABLE "news_event_types" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_th" VARCHAR(100),
    "slug" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "news_event_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_events" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "status" "NewsEventStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "excerpt" VARCHAR(500),
    "content" TEXT NOT NULL,
    "title_th" VARCHAR(255),
    "excerpt_th" VARCHAR(500),
    "content_th" TEXT,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "location" VARCHAR(255),
    "location_th" VARCHAR(255),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "seo_metadata" JSONB DEFAULT '{}',
    "type_id" INTEGER NOT NULL,
    "author_id" INTEGER,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "news_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_event_images" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "thumbnail_url" VARCHAR(512),
    "alt_text" VARCHAR(255),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "news_event_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_event_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_event_types_sid_key" ON "news_event_types"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "news_event_types_name_key" ON "news_event_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "news_event_types_slug_key" ON "news_event_types"("slug");

-- CreateIndex
CREATE INDEX "news_event_types_is_active_display_order_idx" ON "news_event_types"("is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "news_events_sid_key" ON "news_events"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "news_events_slug_key" ON "news_events"("slug");

-- CreateIndex
CREATE INDEX "news_events_status_published_at_idx" ON "news_events"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "news_events_type_id_status_published_at_idx" ON "news_events"("type_id", "status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "news_events_status_title_idx" ON "news_events"("status", "title");

-- CreateIndex
CREATE INDEX "news_events_status_is_featured_idx" ON "news_events"("status", "is_featured");

-- CreateIndex
CREATE INDEX "news_events_title_trgm_idx" ON "news_events" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "news_event_images_news_event_id_is_cover_idx" ON "news_event_images"("news_event_id", "is_cover");

-- AddForeignKey
ALTER TABLE "news_event_types" ADD CONSTRAINT "news_event_types_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_event_types" ADD CONSTRAINT "news_event_types_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_events" ADD CONSTRAINT "news_events_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "news_event_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_events" ADD CONSTRAINT "news_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_event_images" ADD CONSTRAINT "news_event_images_news_event_id_fkey" FOREIGN KEY ("news_event_id") REFERENCES "news_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AT MOST ONE COVER IMAGE PER POST. PRISMA'S DSL CANNOT EXPRESS A FILTERED
-- UNIQUE INDEX — SAME PATTERN AS product_images_one_primary_per_product.
CREATE UNIQUE INDEX "news_event_images_one_cover_per_post" ON "news_event_images"("news_event_id") WHERE "is_cover";
