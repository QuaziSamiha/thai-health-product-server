-- profiles_firstName_lastName_idx was a plain btree — useless for the
-- `contains`/ILIKE substring search the admin user-search endpoints actually
-- run (UserRepository.findAllUsers, DeliveryManRepository.findAllDeliveryMen
-- both search firstName/lastName via PaginationService's `contains` search).
-- pg_trgm + GIN is the standard index shape for substring/ILIKE search on
-- Postgres text columns.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX "profiles_firstName_lastName_idx";

CREATE INDEX "profiles_first_name_trgm_idx" ON "profiles" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "profiles_last_name_trgm_idx" ON "profiles" USING GIN ("lastName" gin_trgm_ops);
