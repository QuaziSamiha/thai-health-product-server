-- Drop the unused `sessions` table.
-- Never read or written by any repository — refresh tokens are pure
-- stateless JWTs (AuthService.refreshToken only calls jwtService.verifyAsync,
-- it never touches Prisma). SessionService/SessionController/SessionRepository
-- were empty stub classes with no routes and no methods; AuthModule never
-- even imported SessionModule. Dropping the table (rather than leaving it as
-- unused scaffolding) removes a live-DB column that would otherwise invite
-- a future implementation to store the raw refresh token in plaintext.
DROP TABLE "sessions";
