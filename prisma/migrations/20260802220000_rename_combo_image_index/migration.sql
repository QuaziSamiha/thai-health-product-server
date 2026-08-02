-- Follow-up to 20260802210000_snake_case_combo_columns.
--
-- ALTER TABLE ... RENAME COLUMN updates an index's *definition* but not its
-- *name*. combo_images_combo_id_isPrimary_idx was named after the old column,
-- so once "isPrimary" became "is_primary" the index name no longer matched
-- what Prisma derives from the mapped columns. `prisma migrate dev` treated
-- that as a pending schema change and prompted for a new migration name.
--
-- Same class of cleanup as 20260719160000_rename_product_fk_index_names.
-- Only this one index was affected: the other combo indexes are either
-- hand-named (combo_products_live_idx, combo_items_unique_without_variant) or
-- built on columns that were already snake_case (product_id, variant_id).

-- RenameIndex
ALTER INDEX "public"."combo_images_combo_id_isPrimary_idx" RENAME TO "combo_images_combo_id_is_primary_idx";
