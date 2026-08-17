-- Drop the composite users(email, phone) index.
-- email is already covered by the partial unique index users_email_active_key
-- (see migration 20260813082256_soft_delete_user_email_unique), and a btree
-- index leading with email can't serve a phone-only lookup (leftmost-prefix
-- rule) — so this index never helped either column.
DROP INDEX "users_email_phone_idx";
