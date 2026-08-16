-- Prevent two `users` rows from claiming the same OAuth identity.
-- Postgres treats NULL as distinct from every other NULL in a unique index,
-- so EMAIL-auth rows (providerId IS NULL) are unaffected -- this only
-- constrains rows that actually carry a (authProvider, providerId) pair.
CREATE UNIQUE INDEX "users_auth_provider_provider_id_key" ON "users"("authProvider", "providerId");
