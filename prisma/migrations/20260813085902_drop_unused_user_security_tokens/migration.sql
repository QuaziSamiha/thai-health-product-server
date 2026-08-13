-- Drop the unused verification/reset token columns on user_security.
-- Never read or written by any repository — SIGNUP/PASSWORD_RESET/LOGIN_2FA/
-- PHONE_CHANGE verification all flow through the OTP model instead, which
-- (unlike these single-slot columns) supports concurrent/historical tokens.
ALTER TABLE "user_security" DROP COLUMN "verificationToken";
ALTER TABLE "user_security" DROP COLUMN "verificationTokenExpires";
ALTER TABLE "user_security" DROP COLUMN "resetToken";
ALTER TABLE "user_security" DROP COLUMN "resetTokenExpires";
