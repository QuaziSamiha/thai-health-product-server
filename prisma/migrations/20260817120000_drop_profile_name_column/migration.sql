-- profiles.name was a denormalized cache of firstName + lastName with no
-- enforced sync strategy: CreateProfileDto let a caller set an independent
-- value at signup, but every subsequent profile update
-- (UserService.updateProfile) silently overwrote it with a fresh
-- firstName+lastName concatenation, discarding whatever was there. Every
-- caller that used to read profile.name now derives it from firstName/
-- lastName at response time instead (src/common/utils/display-name.util.ts).
ALTER TABLE "profiles" DROP COLUMN "name";
