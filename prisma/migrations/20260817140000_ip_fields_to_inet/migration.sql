-- lastLoginIp/assignedIp were plain text with no format enforcement.
-- Postgres's native inet type validates on write and keeps CIDR/range
-- queries available for future fraud/geo rules without app-layer parsing.
-- Existing values were checked before writing this migration and contain
-- nothing but clean IPv4/IPv6 literals (e.g. "::1", "192.168.1.100"), so the
-- USING cast is safe against current data.
ALTER TABLE "user_security"
  ALTER COLUMN "lastLoginIp" TYPE INET USING "lastLoginIp"::inet,
  ALTER COLUMN "assignedIp" TYPE INET USING "assignedIp"::inet;
