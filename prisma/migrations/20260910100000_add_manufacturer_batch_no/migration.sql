-- A batch row has always carried exactly one number: `batch_no`, which we
-- generate ourselves (InventoryService.buildBatchNo — product code, date and
-- row id). That number exists nowhere outside this system, so it cannot answer
-- the question the physical goods actually pose: the factory prints its own
-- lot number on the pack, and that is what a supplier's recall notice, a QA
-- certificate, or a customer holding the bottle will quote.
--
-- `manufacturer_batch_no` stores that supplier-side number as typed in by
-- whoever receives the stock. Notably it is:
--
--   * NULLABLE — the number is not always legible or available at receipt
--     time, and every batch already in the table predates the field, so there
--     is no value to backfill them with.
--   * NOT UNIQUE — one factory lot is routinely split across several of our
--     batch rows (different products, different receiving dates), and two
--     unrelated suppliers may well reuse the same string.
ALTER TABLE "public"."batches"
  ADD COLUMN "manufacturer_batch_no" VARCHAR(100);

-- Traceability lookup: "which of our batches came from factory lot X" — the
-- query a recall starts with. Also serves the admin batch-list search, which
-- now matches this column alongside `batch_no`.
CREATE INDEX "batches_manufacturer_batch_no_idx"
  ON "public"."batches" ("manufacturer_batch_no");
