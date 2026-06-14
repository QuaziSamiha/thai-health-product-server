```bash
enum CategoryStatus {
  ACTIVE
  INACTIVE
  DRAFT
  ARCHIVED
  HIDDEN
}
```

```bash
model Category {
  id     Int            @id @default(autoincrement())
  sid    String         @unique @default(uuid())
  status CategoryStatus @default(ACTIVE)

  name        String  @db.VarChar(255)
  slug        String  @unique @db.VarChar(255)IDENTIFIER
  description String? @db.Text

  nameTh        String? @db.VarChar(255)
  descriptionTh String? @db.Text

  parentId Int?
  parent   Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: NoAction)
  children Category[] @relation("CategoryHierarchy")
  level    Int        @default(0)

  thumbnailUrl String? @db.VarChar(512)
  bannerUrl    String? @db.VarChar(512)
  iconUrl      String? @db.VarChar(512)

  displayOrder Int     @default(0)
  isFeatured   Boolean @default(false)
  productCount Int     @default(0)

  metaTitle         String? @db.VarChar(255)
  metaDescription   String? @db.Text
  metaTitleTh       String? @db.VarChar(255)
  metaDescriptionTh String? @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  createdBy     Int?
  createdByUser User? @relation("CategoryCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updatedBy     Int?
  updatedByUser User? @relation("CategoryUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)

  @@index([slug])
  @@index([parentId, status])
  @@index([status, isFeatured])
  @@index([displayOrder])
  @@map("categories")
}
```

### **Database Documentation: Category Schema**

This document outlines the purpose and structure of the `categories` table within the **Essence Lab** project. It is designed to support high-performance e-commerce features, including hierarchical menus, localized content, and SEO optimization.

---

### **1. Category Data Overview**

The following table demonstrates how hierarchical relationships, localized naming, and display priorities are stored.

| id    | parentId | level | name               | nameTh            | slug                 | displayOrder | isFeatured | status     |
| :---- | :------- | :---- | :----------------- | :---------------- | :------------------- | :----------- | :--------- | :--------- |
| **1** | `null`   | `0`   | Herbal Supplements | อาหารเสริมสมุนไพร | `herbal-supplements` | `1`          | `true`     | `ACTIVE`   |
| **2** | `1`      | `1`   | Turmeric Extract   | สารสกัดขมิ้นชัน   | `turmeric-extract`   | `1`          | `false`    | `ACTIVE`   |
| **3** | `1`      | `1`   | Ginger Root        | รากขิง            | `ginger-root`        | `2`          | `false`    | `ACTIVE`   |
| **4** | `null`   | `0`   | Natural Skincare   | สกินแคร์ธรรมชาติ  | `natural-skincare`   | `2`          | `true`     | `ACTIVE`   |
| **5** | `null`   | `0`   | Discontinued Line  | สินค้าที่ยกเลิก   | `old-line`           | `99`         | `false`    | `ARCHIVED` |
| **6** | `null`   | `0`   | Organic Tea        | ชาออร์แกนิก       | `organic-tea`        | `3`          | `false`    | `DRAFT`    |

---

### **2. Specialized Column Definitions**

#### **Hierarchy & Navigation**

- **`parentId`**: Defines the relationship in a tree structure. A `null` value indicates a top-level "Root" category.
- **`level`**: Stores the depth of the category (e.g., `0` for Root, `1` for Sub-category).
  - **Benefit:** Stores the depth of the category (e.g., 0 for Root, 1 for Sub-category). This allows the frontend to quickly filter for "Top Level" menus without calculating the tree structure on every request. This allows the frontend to fetch breadcrumbs or filter "Top Level" menus using non-recursive queries, significantly reducing database load for deep hierarchies.

#### **Optimized Asset Management**

To ensure fast page loads, image URLs are split into three specific use cases. This allows the Next.js frontend to use the `next/image` component to load only the resolution required for the user's device:

- **`thumbnailUrl`**: (e.g., `/assets/cat/vitamins_small.webp`). Used for sidebar lists or mobile menus.
- **`bannerUrl`**: (e.g., `/assets/cat/vitamins_hero.png`). High-resolution hero image for category landing pages.
- **`iconUrl`**: (e.g., `/assets/icons/vitamin.svg`). Small vector icons for navigation bars or "Mega Menus."

#### **Localization (Secondary Language)**

- **`nameTh` / `descriptionTh`**: Stores Thai translations.
  - **Fallback Logic:** If these fields are empty, the application logic defaults to the primary English `name` and `description`.
- **`metaTitle` / `metaDescription`**: Standard SEO tags for English search results.
- **`metaTitleTh` / `metaDescriptionTh`**: Localized SEO tags.
  - **The Meta Concept:** These fields control how the category appears on Google. By providing localized meta tags, we ensure that a Thai user searching in Thai sees a Thai title and description in their search results, drastically improving the **Click-Through Rate (CTR)**.

#### **Performance & Discovery**

- **`displayOrder`**: An integer for manual sorting (e.g., `1`, `2`, `3`). This gives admins direct control over the UI layout, allowing marketing teams to push "Best Sellers" to the top regardless of alphabetical order.
- **`isFeatured`**: A boolean flag. Used to instantly query high-priority categories for special homepage sections.
- **`productCount`**: A **denormalized counter**. Instead of calculating how many products are in a category on every page load (which is slow), this column stores a pre-calculated number that is updated when products are added/removed.

---

### **3. Indexing & Logic**

#### **Targeted Indexing**

The schema utilizes composite and single-column indexes to maintain sub-millisecond response times:

- **`slug`**: Primary index for instant URL lookups (e.g., `/category/turmeric-extract`).
- **`[parentId, status]`**: A **Composite Index**. In e-commerce, we rarely search for a parent alone; we search for "Active categories under Parent X." This index allows the database to filter both conditions in a single scan.
- **`displayOrder`**: Ensures the database can sort large menus without high CPU overhead.

#### **Enums & Soft Deletes**

- **Status Management:** The `ARCHIVED` status acts as a **Soft Delete**.
  - **Implementation:** The Prisma Service should utilize a global filter so that standard `findMany` queries automatically exclude `ARCHIVED` and `DRAFT` items unless they are explicitly requested by an authorized admin.

---

### **4. Summary Checklist for Admins**

- **Mandatory:** English `name` and `slug`.
- **Optional:** Thai `nameTh`, `descriptionTh`, and localized Meta tags.
- **Sorting:** Lower `displayOrder` numbers (e.g., `0` or `1`) appear first in the menu.

### Commands

1. Development Migration

```bash
npx prisma migrate dev --name init_category_model
```

```bash
npx prisma generate
```