# Auth Module — Senior Engineer Review Plan

## Overview

This document covers every issue found in the auth module during the senior-level review. Changes are grouped by severity and ordered for safe, incremental execution. Each step is self-contained — do them in order.

---

## Critical Bugs (Break Things in Production)

### 1. `auth.module.ts` — Wrong JWT Config Keys

**File:** `src/modules/auth/auth.module.ts`

`JwtModule.registerAsync` is configured with `JWT_SECRET` and `JWT_EXPIRES_IN` env vars, but:
- The strategy reads `JWT_ACCESS_SECRET`
- The service uses `auth.accessSecret` from the config namespace

The module-level config is dead and mismatched. If the service is ever removed and the JwtModule defaults are relied on, it will use the wrong secret.

**Fix:** Update `JwtModule.registerAsync` to use `auth.accessSecret` and `auth.accessExpiresIn`.

---

### 2. `auth.controller.ts` — Wrong Error Handling Pattern

**File:** `src/modules/auth/auth.controller.ts`

Both `login` and `refresh` wrap everything in `try/catch` and return all errors as `400 BAD_REQUEST` via `sendResponse()`.

This means:
- `UnauthorizedException` (401) from `auth.service.ts` gets swallowed → returned as 400
- `ForbiddenException` (403) from `auth.service.ts` gets swallowed → returned as 400

The `GlobalExceptionFilter` already exists to handle this. Controllers must never catch exceptions — they should just throw them and let the filter serialize the correct HTTP status.

**Fix:** Remove all `try/catch` blocks from the controller. Remove `@Res()` injection. Use `return` with `@HttpCode()`.

---

### 3. `jwt.strategy.ts` — Inconsistent Config Key

**File:** `src/modules/auth/strategies/jwt.strategy.ts`

Reads `configService.get<string>('JWT_ACCESS_SECRET')` directly from the flat env namespace, while everything else uses the `auth` config namespace (`configService.get('auth').accessSecret`).

If `auth.config.ts` is ever renamed or moved, the strategy will silently fail with an undefined secret.

**Fix:** Use `configService.get<string>('auth.accessSecret')` or `configService.get('auth')?.accessSecret`.

---

### 4. `jwt-auth.guard.ts` — `@Public()` Check Happens After Passport Runs

**File:** `src/common/guards/jwt-auth.guard.ts`

Current logic:
```
1. Run passport JWT validation (hits ExtractJwt, validates signature)
2. If it throws → check if @Public() → return true
```

Correct logic:
```
1. Check if @Public() → return true immediately
2. Run passport JWT validation
```

Every public route (login, register, etc.) currently runs the full JWT extraction and validation pipeline before being allowed through. This is wasteful and fragile.

**Fix:** Read `isPublic` first. If true, return `true` before calling `super.canActivate()`.

---

## Security Vulnerabilities

### 5. Stateless Refresh Tokens — No Revocation Possible

**Files:** `src/modules/auth/auth.service.ts`, `src/modules/session/`

The `Session` model in Prisma has `refreshToken`, `refreshTokenExpiresAt`, `userAgent`, `ipAddress` — it was designed for stateful refresh token management — but `auth.service.ts` never writes to it.

**Consequence:** A stolen refresh token cannot be revoked. Logout does not invalidate anything. If an attacker captures a refresh token, they retain access for the full 30-day expiry period even after the user changes their password.

**Fix:** On `login()`, create a `Session` row with the refresh token hash, IP, and user agent. On `refreshToken()`, look up the token in the DB, validate it exists and hasn't been revoked, then rotate it.

---

### 6. No Token Rotation on Refresh

**File:** `src/modules/auth/auth.service.ts`

On every `POST /auth/refresh`, a new access token is issued but the same refresh token remains valid forever. This violates the refresh token rotation security principle.

**Consequence:** If a refresh token is intercepted, the attacker can use it indefinitely. The legitimate user and the attacker both hold a working refresh token with no way to detect the conflict.

**Fix:** On each `refreshToken()` call: delete the old Session row, insert a new one with the newly generated refresh token, and return the new refresh token in both the cookie and response.

---

### 7. Login Attempts Tracked but Never Enforced

**Files:** `src/modules/auth/auth.service.ts`, `src/modules/user/user.service.ts`

`updateLoginAttempts()` increments `UserSecurity.loginAttempts` on every failed login, but nothing ever reads or acts on that counter. There is no lockout, no rate limit, no consequence for repeated failed attempts.

**Consequence:** Brute-force attacks on user passwords are completely unimpeded.

**Fix:** After incrementing login attempts, check if the count exceeds a threshold (e.g., 5). If so, set `user.status = SUSPENDED` (or throw `TooManyRequestsException`). On successful login, reset the counter to 0 (already partially handled by `updateLoginSuccess`).

---

### 8. No Logout Endpoint

**File:** `src/modules/auth/auth.controller.ts`

There is a comment `// a post api for logout` but no implementation. Without server-side session invalidation, there is no way to kill a token before it expires.

**Fix:** Add `POST /auth/logout`. It should:
1. Read `refreshToken` from the cookie
2. Call `SessionService.deleteSession(refreshToken)` to invalidate the DB record
3. Clear the `refreshToken` cookie (`res.clearCookie('refreshToken')`)
4. Return 200

---

## Architecture Problems

### 9. `validateUser()` Returns a Response DTO (DTO Leaking into Service Layer)

**File:** `src/modules/auth/auth.service.ts`

`validateUser()` is a private internal method but it returns `UserResponseDto` — a class designed for HTTP responses. DTOs belong at the HTTP boundary (controller layer), not inside service-to-service calls.

**Fix:** Define an `IAuthUser` internal interface (e.g., in `interfaces/auth-user.interface.ts`) and return that from `validateUser()`. `UserResponseDto` should only be constructed in the controller or in the public-facing `login()` response.

```typescript
// interfaces/auth-user.interface.ts
export interface IAuthUser {
  id: number;
  sid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  authProvider: AuthProvider;
}
```

---

### 10. Three Separate DB Round-Trips on Every Successful Login

**File:** `src/modules/auth/auth.service.ts`

On a successful login, three separate database calls are fired sequentially:
1. `findUserByEmailWithPassword()` — in `validateUser()`
2. `updateLoginSuccess()` — resets attempts, updates IP
3. `updateLastLoginTime()` — updates `lastLoginAt`

Calls 2 and 3 touch the same user record and can be merged into a single Prisma `update`. Call 1 is unavoidable.

**Fix:** Merge `updateLoginSuccess` and `updateLastLoginTime` into a single `updateLoginMetadata(userId, ip)` call that sets all fields in one `prisma.user.update()`.

---

### 11. `@CurrentUser()` Decorator is Empty

**File:** `src/common/decorators/auth/current-user.decorator.ts`

The file exists and is referenced, but has no implementation. Every controller that needs the authenticated user is forced to inject `@Req() req: Request` and access `req.user` manually.

**Fix:**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: keyof IRequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as IRequestUser;
    return data ? user?.[data] : user;
  },
);
```

Usage: `@CurrentUser() user: IRequestUser` or `@CurrentUser('id') userId: number`.

---

### 12. Auth Config Read Per-Call Instead of Once

**File:** `src/modules/auth/auth.service.ts`

`this.configService.get('auth')` is called inside `generateTokens()` and `refreshToken()` — meaning it's invoked on every single authenticated request. Config lookups aren't free.

**Fix:** Read and cache auth config in the constructor:

```typescript
private readonly authConfig: AuthConfig;

constructor(...) {
  this.authConfig = this.configService.get('auth');
}
```

---

## Code Quality Issues

### 13. `parseInt()` on an Already-Parsed Number

**File:** `src/modules/auth/auth.controller.ts:77`

```typescript
const maxAge = parseInt(refreshTokenExpires, 10);
res.cookie('refreshToken', tokens.refresh_token, {
  maxAge: isNaN(maxAge) ? Number(authConfig?.refreshExpiresInMs) : maxAge,
});
```

`authConfig?.refreshExpiresInMs` is typed as `number` from Zod validation (`z.number().default(2592000000)`). The `parseInt` + `isNaN` + `Number()` fallback is dead code and actively confusing.

**Fix:** Use the value directly: `maxAge: authConfig.refreshExpiresInMs`.

---

### 14. Logger Declared After Constructor

**File:** `src/modules/auth/auth.controller.ts`

```typescript
constructor(...) {}
private readonly logger = new Logger(AuthController.name); // ← wrong position
```

NestJS convention (and TypeScript field initialization order) requires class fields to be declared before the constructor.

**Fix:** Move `private readonly logger` to the top of the class, before the constructor.

---

### 15. Commented-Out Dead Code

**Files:** `src/modules/auth/auth.service.ts`, `src/modules/auth/auth.controller.ts`

Multiple blocks of commented-out code:
- `auth.service.ts:67-72` — old `loginPayload` approach
- `auth.controller.ts:68` — `console.log("res", res)`

Dead code adds noise and confuses future readers about intent.

**Fix:** Delete all commented-out code blocks.

---

### 16. Typo in Error Message

**File:** `src/modules/auth/auth.service.ts:54`

```
'Password not set. Please use thirdy party (Google, Facebook) login.'
```

"thirdy" should be "third-party".

---

## Step-by-Step Execution Order

| Step | File(s) | What to Do | Type |
|------|---------|------------|------|
| 1 | `auth.module.ts` | Fix `JwtModule` config keys to use `auth.accessSecret` | Bug Fix |
| 2 | `jwt-auth.guard.ts` | Invert `@Public()` check — before passport, not after | Bug Fix |
| 3 | `current-user.decorator.ts` | Implement `createParamDecorator` | Feature |
| 4 | `interfaces/auth-user.interface.ts` | Create `IAuthUser` internal interface | Refactor |
| 5 | `auth.service.ts` | Cache config in constructor, fix `validateUser` return type, merge DB calls | Refactor |
| 6 | `jwt.strategy.ts` | Fix config key to use `auth.accessSecret` namespace | Bug Fix |
| 7 | Session module | Add `createSession`, `rotateRefreshToken`, `deleteSession` methods | Feature |
| 8 | `auth.service.ts` | Wire sessions into `login()` and `refreshToken()` | Security |
| 9 | `auth.service.ts` | Add brute-force lockout after N failed attempts | Security |
| 10 | `auth.controller.ts` | Remove `try/catch`, remove `@Res()`, add logout endpoint, fix logger position, remove dead code | Bug Fix + Cleanup |

---

## File Change Map

| File | Change Type | Priority |
|------|-------------|----------|
| `src/modules/auth/auth.module.ts` | Fix config keys | Critical |
| `src/modules/auth/auth.controller.ts` | Remove try/catch, add logout, fix structure | Critical |
| `src/modules/auth/auth.service.ts` | Fix return types, cache config, merge DB calls, session wiring, lockout | High |
| `src/modules/auth/strategies/jwt.strategy.ts` | Fix config key namespace | Critical |
| `src/common/guards/jwt-auth.guard.ts` | Invert `@Public()` check order | High |
| `src/common/decorators/auth/current-user.decorator.ts` | Implement decorator | High |
| `src/modules/auth/interfaces/auth-user.interface.ts` | New file — internal user type | Medium |
| `src/modules/session/` (existing module) | Add session CRUD for refresh token management | High |
