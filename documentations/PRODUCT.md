### ENUMS

```bash
enum CategoryProductStatus {
  ACTIVE
  INACTIVE
  DRAFT
  ARCHIVED
  HIDDEN
}

enum ProductType {
  SIMPLE
  VARIABLE
  COMBO
}

enum DiscountType {
  FIXED
  PERCENTAGE
}

enum StockStatus {
  IN_STOCK
  OUT_OF_STOCK
  LOW_STOCK
}
```

### Model

```bash
model Product {
  //* SEARCH & IDENTITY
  id  Int    @id @default(autoincrement())
  sid String @unique @default(uuid()) @db.Uuid

  name             String  @unique @db.VarChar(255)
  slug             String  @unique @db.VarChar(255)
  sku              String? @unique @db.VarChar(100)
  barcode          String? @unique @db.VarChar(100)
  //* PRIMARY CONTENT (ENGLISH & GLOBAL SLUG)
  description      String? @db.Text
  shortDescription String? @db.VarChar(500)

  //* SECONDARY CONTENT (THAI DISPLAY)
  nameTh        String? @db.VarChar(255)
  descriptionTh String? @db.Text
  shortDescTh   String? @db.VarChar(500)

  //* CONFIGURATIONS
  type        ProductType           @default(SIMPLE)
  status      CategoryProductStatus @default(ACTIVE)
  isFeatured  Boolean               @default(false)
  hasVariants Boolean               @default(false)

  //* PRICING (USE DECIMAL FOR FINANCIAL ACCURACY)
  basePrice    Decimal       @default(0) @db.Decimal(12, 2)
  discountType DiscountType?
  salePrice    Decimal?      @db.Decimal(12, 2)
  costPrice    Decimal?      @db.Decimal(12, 2)

  //* STOCK
  quantity    Int         @default(0)
  totalStock  Int         @default(0) @map("total_stock")
  stockStatus StockStatus @default(OUT_OF_STOCK)

  // * PHYSICAL
  weight     Decimal? @db.Decimal(10, 3)
  dimensions Json?    @default("{}")

  //* SEO METADATA
  seoMetadata Json? @default("{}")

  tags String[]

  //* RELATIONS
  categoryId    Int
  category      Category         @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  images        ProductImage[]
  variants      ProductVariant[]
  inventoryLogs Inventory[]

  //* AUDIT & TIMESTAMPS
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  publishedAt DateTime? @map("published_at")
  createdBy     Int?  @map("created_by")
  createdByUser User? @relation("ProductCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updatedBy     Int?  @map("updated_by")
  updatedByUser User? @relation("ProductUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
  deletedBy     Int?  @map("deleted_by")
  deletedByUser User? @relation("ProductDeletedBy", fields: [deletedBy], references: [id], onDelete: SetNull)

  @@index([stockStatus])
  @@index([status, type, publishedAt])
  @@index([categoryId, status])
  @@index([status, isFeatured])
  @@index([createdAt])
  @@map("products")
}
```

### Product Data Dictionary

| Field           | Type        | Description                     | Reason/Strategy                                                                                   |
| :-------------- | :---------- | :------------------------------ | :------------------------------------------------------------------------------------------------ |
| **sid**         | `UUID`      | Unique public identifier.       | Prevents ID scraping/enumeration and offers better indexing performance than strings.             |
| **slug**        | `String`    | URL-friendly unique identifier. | Primary lookup key for SEO-friendly product pages.                                                |
| **sku**         | `String?`   | Stock Keeping Unit.             | Unique identifier for internal logistics and inventory tracking.                                  |
| **type**        | `Enum`      | `SIMPLE`, `VARIABLE`, `COMBO`.  | Determines whether the system should look for Variants or treat the product as a single unit.     |
| **status**      | `Enum`      | `ACTIVE`, `DRAFT`, etc.         | Controls visibility. Allows products to be prepared in draft before going live.                   |
| **basePrice**   | `Decimal`   | The standard retail price.      | `Decimal` is used to prevent floating-point math errors in financial calculations.                |
| **salePrice**   | `Decimal?`  | Current discounted price.       | Stored separately to allow for "Strike-through" pricing in the UI.                                |
| **totalStock**  | `Int`       | Sum of all variant stock.       | **Denormalized Cache**: Optimized for fast reads on listing pages without complex joins.          |
| **dimensions**  | `JSONB`     | `{l, w, h, unit}`               | Flexible storage for shipping calculations without cluttering the table with 4 columns.           |
| **seoMetadata** | `JSONB`     | SEO Titles and Descriptions.    | Consolidates localization and SEO tags into a single object for a cleaner API response.           |
| **tags**        | `String[]`  | Array of labels/keywords.       | Native Postgres support allows for fast filtering using GIN indexes for search.                   |
| **publishedAt** | `DateTime?` | Future or past date.            | Enables scheduled publishing logic (Draft -> Live at a specific time).                            |
| **deletedAt**   | `DateTime?` | Timestamp of deletion.          | **Soft Delete**: Preserves data integrity for historical orders while hiding the item from users. |
| **createdBy**   | `Int?`      | User ID relation.               | Essential for audit trails in multi-vendor or multi-admin environments.                           |

---

### Detailed Field Examples (JSON Objects)

Since fields like `seoMetadata` and `dimensions` are JSONB, here is how you should format them for the rows above:

| Field           | Example Value (JSON)                                                                                        | Description                                     |
| :-------------- | :---------------------------------------------------------------------------------------------------------- | :---------------------------------------------- |
| **seoMetadata** | `{"title": "Best Coffee", "desc": "Organic beans from Chiang Mai", "titleTh": "กาแฟอาราบิก้าเกรดพรีเมียม"}` | Stores localized SEO tags.                      |
| **dimensions**  | `{"length": 15.5, "width": 10.0, "height": 25.0, "unit": "cm"}`                                             | Used for shipping cost calculation.             |
| **tags**        | `["organic", "beverage", "chiang-mai", "bestseller"]`                                                       | Array of strings for native Postgres filtering. |

### Example Data

| name                   | type       | status     | basePrice  | salePrice | quantity | totalStock | sku             | barcode      | hasVariants | dimensions (JSONB)                  | seoMetadata (JSONB)                             | tags                   | publishedAt         |
| :--------------------- | :--------- | :--------- | :--------- | :-------- | :------- | :--------- | :-------------- | :----------- | :---------- | :---------------------------------- | :---------------------------------------------- | :--------------------- | :------------------ |
| **Arabica Dark Roast** | `SIMPLE`   | `ACTIVE`   | `450.00`   | `399.00`  | `150`    | `150`      | `COF-DRK-500`   | `8850123456` | `false`     | `{"l":10,"w":5,"h":20,"u":"cm"}`    | `{"title":"Dark Roast","desc":"Organic beans"}` | `["coffee","organic"]` | `2024-01-10T08:00Z` |
| **Premium Silk Shirt** | `VARIABLE` | `ACTIVE`   | `1200.00`  | `null`    | `0`      | `85`       | `SHIRT-SILK-01` | `8850987654` | `true`      | `{"l":30,"w":25,"h":2,"u":"cm"}`    | `{"title":"Silk Shirt","titleTh":"เสื้อไหม"}`   | `["fashion","silk"]`   | `2024-02-15T09:00Z` |
| **ErgoChair X-1**      | `SIMPLE`   | `DRAFT`    | `5500.00`  | `null`    | `0`      | `0`        | `OFF-CHR-X1`    | `null`       | `false`     | `{"l":60,"w":60,"h":120,"u":"cm"}`  | `{"desc":"Best office chair"}`                  | `["office","chair"]`   | `null`              |
| **Smart LED Bulb**     | `VARIABLE` | `ACTIVE`   | `350.00`   | `299.00`  | `0`      | `1000`     | `IOT-LGT-RGB`   | `8850111222` | `true`      | `{"l":6,"w":6,"h":12,"u":"cm"}`     | `{"title":"RGB Bulb","desc":"WiFi Enabled"}`    | `["iot","smart-home"]` | `2024-03-01T12:00Z` |
| **Stainless Flask**    | `SIMPLE`   | `ACTIVE`   | `850.00`   | `750.00`  | `45`     | `45`       | `FLSK-SS-500`   | `8850333444` | `false`     | `{"l":7,"w":7,"h":25,"u":"cm"}`     | `{"title":"500ml Flask"}`                       | `["eco","kitchen"]`    | `2024-01-20T15:30Z` |
| **Gamer Mouse Pro**    | `VARIABLE` | `INACTIVE` | `2200.00`  | `null`    | `0`      | `10`       | `ACC-MSE-PRO`   | `8850555666` | `true`      | `{"l":12,"w":7,"h":4,"u":"cm"}`     | `{"title":"Pro Mouse"}`                         | `["gaming","tech"]`    | `2023-11-01T00:00Z` |
| **Organic Soy Milk**   | `SIMPLE`   | `ACTIVE`   | `45.00`    | `39.00`   | `2000`   | `2000`     | `BEV-SOY-L`     | `8850777888` | `false`     | `{"l":8,"w":8,"h":20,"u":"cm"}`     | `{"titleTh":"นมถั่วเหลือง"}`                    | `["vegan","drinks"]`   | `2024-04-01T07:00Z` |
| **Leather Wallet**     | `SIMPLE`   | `ACTIVE`   | `950.00`   | `null`    | `32`     | `32`       | `WLT-LTH-BRN`   | `8850999000` | `false`     | `{"l":11,"w":9,"h":2,"u":"cm"}`     | `{"desc":"Genuine leather"}`                    | `["men","fashion"]`    | `2024-02-10T10:00Z` |
| **Yoga Mat 6mm**       | `VARIABLE` | `HIDDEN`   | `1100.00`  | `900.00`  | `0`      | `50`       | `YOGA-MAT-06`   | `8850112233` | `true`      | `{"l":183,"w":61,"h":0.6,"u":"cm"}` | `{"title":"Eco Yoga Mat"}`                      | `["sports","yoga"]`    | `2024-03-15T08:00Z` |
| **Protein Powder**     | `VARIABLE` | `ACTIVE`   | `1800.00`  | `1650.00` | `0`      | `140`      | `SUP-PRO-VAN`   | `8850445566` | `true`      | `{"l":20,"w":20,"h":30,"u":"cm"}`   | `{"title":"Whey Protein"}`                      | `["fitness","gym"]`    | `2024-04-10T09:00Z` |
| **Vintage Camera**     | `SIMPLE`   | `ARCHIVED` | `12000.00` | `null`    | `0`      | `0`        | `CAM-VINT-70`   | `null`       | `false`     | `{"l":15,"w":10,"h":8,"u":"cm"}`    | `{}`                                            | `["collectible"]`      | `2022-01-01T00:00Z` |

---

### Example Usage (JSON Response)

To help front-end developers, you might include a sample of how this model looks when queried:

```json
{
  "sid": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Classic Leather Boots",
  "type": "VARIABLE",
  "basePrice": 120.0,
  "salePrice": 99.99,
  "totalStock": 45,
  "seoMetadata": {
    "metaTitle": "Premium Leather Boots | Shop Now",
    "metaDescription": "Durable and stylish boots made from 100% grain leather."
  }
}
```

- Simple Product (Standard Stock)

This represents a standalone item with no variants, using the `quantity` field directly and localized Thai content.

```json
{
  "sid": "7b2e9140-1b2c-4d3e-8f9a-2b1c3d4e5f6g",
  "name": "Organic Arabica Coffee",
  "nameTh": "กาแฟอาราบิก้าออร์แกนิก",
  "slug": "organic-arabica-coffee",
  "type": "SIMPLE",
  "status": "ACTIVE",
  "basePrice": 450.0,
  "salePrice": 399.0,
  "discountType": "FIXED",
  "quantity": 150,
  "totalStock": 150,
  "stockStatus": "IN_STOCK",
  "hasVariants": false,
  "dimensions": {
    "length": 10,
    "width": 5,
    "height": 20,
    "unit": "cm"
  },
  "tags": ["coffee", "organic", "beverage"],
  "publishedAt": "2024-01-10T08:00:00Z"
}
```

- Variable Product (Parent View)

This is what the "Product Listing Page" (PLP) sees. It shows `totalStock` (the cache) and lacks a specific SKU since the SKUs belong to the variants.

```json
{
  "sid": "a1b2c3d4-e5f6-4a5b-bc6d-7e8f9a0b1c2d",
  "name": "Elite Running Shoes",
  "slug": "elite-running-shoes",
  "type": "VARIABLE",
  "status": "ACTIVE",
  "basePrice": 4500.0,
  "salePrice": 3800.0,
  "hasVariants": true,
  "totalStock": 120,
  "stockStatus": "IN_STOCK",
  "seoMetadata": {
    "metaTitle": "Elite Run Pro | Professional Shoes",
    "metaDescription": "Engineered for speed and comfort.",
    "metaTitleTh": "รองเท้าวิ่งรุ่น Elite Run Pro"
  },
  "tags": ["sports", "shoes", "new-arrival"]
}
```

- Product with Scheduled Launch (Draft/Pending)

This example shows a product that is prepared but not yet visible to the public because the `publishedAt` date is in the future.

```json
{
  "sid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Smart Watch Series 6",
  "slug": "smart-watch-series-6",
  "type": "SIMPLE",
  "status": "DRAFT",
  "basePrice": 12500.0,
  "salePrice": null,
  "quantity": 0,
  "totalStock": 0,
  "stockStatus": "OUT_OF_STOCK",
  "publishedAt": "2026-06-01T00:00:00Z",
  "createdBy": 12,
  "createdAt": "2026-04-29T08:47:00Z"
}
```

- Archived/Hidden Product (Back-office/Admin View)

This represents a product that has been soft-deleted or archived. It includes audit fields like `deletedAt`.

```json
{
  "sid": "999e888d-777c-666b-555a-444333222111",
  "name": "Vintage Film Camera",
  "slug": "vintage-film-camera-1970",
  "type": "SIMPLE",
  "status": "ARCHIVED",
  "sku": "CAM-VINT-70",
  "basePrice": 12000.0,
  "salePrice": null,
  "deletedAt": "2025-12-31T23:59:59Z",
  "deletedBy": 5,
  "seoMetadata": {},
  "tags": ["legacy", "collectible"]
}
```

## Implementation & Best Practices

### 1. Product Type Architecture

Understanding the distinction between `SIMPLE` and `VARIABLE` types is critical for data integrity.

- **Simple Products:** The `quantity` field is the source of truth. `totalStock` should mirror this value.
- **Variable Products:** The parent `Product` record should have `quantity: 0`. The `totalStock` field acts as a **read-cache (denormalized sum)** of all associated `ProductVariant` stocks.
- **Business Rule:** Front-end applications should use `totalStock` for general "In Stock/Out of Stock" badges to avoid expensive joins during product listing.

### 2. Financial Integrity & Pricing

To ensure consistency across currency conversions and checkout logic:

- **Precision:** Always use `basePrice` as the original MSRP. If `salePrice` is present, it **must** be lower than `basePrice`.
- **Frontend Logic:** If `salePrice != null`, display the `basePrice` with a strike-through decoration.
- **Data Types:** Never perform arithmetic on prices using standard JavaScript floating points. Use libraries like `Decimal.js` or `Big.js`.

### 3. Inventory & Sync Logic

Maintaining the `totalStock` cache requires a strict update pattern:

- **Trigger Pattern:** Any update to a `ProductVariant` quantity or a new `InventoryLog` entry must trigger a recalculation of the parent `Product.totalStock`.
- **Safety Check:** Periodic "Stock Reconciliation" scripts should run to ensure the sum of variants matches the parent's `totalStock`.

### 4. Search & Discovery Optimization

- **Slug Management:** Slugs must be generated once (usually from the name) and remain immutable or support 301 redirects if changed. They are the primary key for SEO.
- **Indexing:** Queries for the storefront should leverage the compound index `[status, type, publishedAt]`.
- **Scheduled Launch:** A product is "live" only if `status == ACTIVE` **AND** `publishedAt <= NOW()`.

### 5. Soft Delete & Data Retention

- **Integrity:** Never `DELETE` a product row. This breaks historical Order records and Analytics.
- **Middleware:** Implement a Prisma/Global middleware to automatically append `WHERE deleted_at IS NULL` to all `findMany` and `findUnique` queries unless specifically requested for the Admin dashboard.
- **Audit:** When `deletedAt` is set, ensure the `status` is also moved to `ARCHIVED` to prevent it from appearing in search indexes.

### 6. JSONB Structure & Extensibility

- **Dimensions:** Always follow the schema `{"l": number, "w": number, "h": number, "u": "cm" | "in"}`. This allows for automated shipping cost calculation.
- **SEO Metadata:** The `seoMetadata` field is intentionally flexible. For multi-language support, follow the internal key-value pair pattern:
  ```json
  {
    "title_en": "Standard Title",
    "title_th": "ชื่อสินค้า",
    "og_image": "https://..."
  }
  ```

### 7. Performance Checklist

- **Native Types:** Ensure the DB uses the `UUID` type for `sid` rather than a standard string to optimize index lookup speed.
- **Eager Loading:** When fetching a Variable Product, always include the `images` relation but use pagination for `inventoryLogs` to prevent large payload sizes.

---

> When creating a product via the Admin API, the `hasVariants` flag should be set automatically based on the presence of a `variants` array in the request payload to ensure the UI can toggle between "Add to Cart" and "Select Options" instantly without checking related tables.

```

```
