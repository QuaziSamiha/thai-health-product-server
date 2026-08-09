# Auth Module

Stateless JWT authentication — login and access/refresh token issuance. Unlike `ComboProduct`/`User`, this module owns no Prisma model of its own; it reads and writes through `UserService` (see [`user.md`](./user.md)) and signs/verifies tokens with `@nestjs/jwt`. It is also the smallest module in the codebase relative to what its name implies: no logout, no registration, no password reset, no third-party login, and no server-side session tracking exist today — this doc spends real space on that gap because a reader coming from `combo-product.md`/`user.md` will otherwise assume those routes exist somewhere and go looking for them.

Module source: `src/modules/auth/` (`auth.controller.ts`, `auth.service.ts`, `auth.module.ts`, `config/`, `dto/`, `guards/`, `interfaces/`, `strategies/`).

> **Scope note:** `User`, `UserSecurity`, and `OTP` are documented in [`user.md`](./user.md) — they appear here only as the data Auth's two routes read or write. `SessionModule` (`src/modules/session/`) is a separate module; it is documented here only because it is the intended-but-unbuilt backing store for refresh tokens, which is directly relevant to understanding Auth's current security posture.

---

### Architecture Overview

#### Token Model

| Token           | Signed with                     | Payload                          | Lifetime (default) | Where it lives                                                                 |
| :--------------- | :--------------------------------- | :---------------------------------- | :-------------------- | :---------------------------------------------------------------------------------- |
| **Access token**  | `JWT_ACCESS_SECRET`                | `{ sub, email, role }` (`IJwtPayload`) | `5d` (`JWT_ACCESS_EXPIRES_IN`) | Returned in the JSON response body only. Read by `JwtStrategy` from an `Authorization: Bearer` header, or (dead path — see [Known Gaps](#known-gaps--recommended-hardening)) an `access_token` cookie that nothing ever sets. |
| **Refresh token** | `JWT_REFRESH_SECRET` (**different secret**) | `{ sub }` only — no `email`/`role` | `30d` (`JWT_REFRESH_EXPIRES_IN`, `2592000000`ms via `JWT_REFRESH_EXPIRES_IN_MS`) | Set as an `httpOnly` cookie named `refreshToken` **and** returned in the JSON response body (see [Known Gaps](#known-gaps--recommended-hardening) — this double-exposure is a real finding, not a convenience). |

Both tokens are minted together by the private `AuthService.generateTokens(payload)`, which signs them with `Promise.all` and two independent `secret`/`expiresIn` overrides passed directly to `jwtService.signAsync` — `JwtModule.registerAsync`'s globally-configured secret (also `accessSecret`) is only ever exercised for the access token; nothing in `AuthModule` registers the refresh secret at the module level, it's applied per-call.

`IJwtPayload` / `ITokens` (`src/modules/auth/interfaces/jwt-payload.interface.ts`):

```ts
export interface IJwtPayload {
  sub: number;   // User ID
  email: string;
  role: UserRole;
}
export interface ITokens {
  access_token: string;
  refresh_token: string;
}
```

**The refresh token deliberately carries only `sub`.** On `/auth/refresh`, `email`/`role` for the *new* token pair are re-read from the database (`userService.getUserById(payload.sub)`), not trusted from the old token — so a role change picked up by a refresh is always current. The tradeoff is the access token itself: since it embeds `email`/`role` and lives up to 5 days with no revocation path, a role change does **not** take effect until that access token naturally expires or the client happens to call `/auth/refresh` — see [Known Gaps](#known-gaps--recommended-hardening).

---

#### Data Dictionary — Session (declared, unused)

**Table purpose (as designed, never realized):** the backing store that would let refresh tokens be revoked, rotated, and enumerated per-device. Schema source: `prisma/schema/user.prisma`, model `Session`, table `sessions`.

| Field                    | Type              | Constraints                                                         | Description                                                                 |
| :------------------------ | :---------------- | :------------------------------------------------------------------ | :------------------------------------------------------------------------------ |
| `id`                      | `INT`             | PK, AUTOINCREMENT                                                    | Internal key.                                                                |
| `refreshToken`            | `TEXT`            | UNIQUE, NOT NULL                                                     | Would hold the issued refresh token (or its hash) for lookup/revocation.     |
| `refreshTokenExpiresAt`   | `TIMESTAMPTZ(3)`  | NOT NULL                                                             | Mirrors the JWT's own `exp`, redundantly — needed for a DB-side cleanup query. |
| `userAgent`               | `VARCHAR`         | NULLABLE                                                             | Per-device session identification.                                          |
| `ipAddress`               | `VARCHAR`         | NULLABLE                                                             | Per-device session identification.                                          |
| `createdAt`               | `TIMESTAMPTZ(3)`  | NOT NULL, DEFAULT `now()` — **no `@map`**, unlike every other `createdAt` in the schema | Minor inconsistency: every other model's `createdAt` is `@map("created_at")`; this one is bare `createdAt` in the `sessions` table. |
| `userId`                  | `INT`             | FK → `users.id`, NOT NULL, **ON DELETE CASCADE**                     | Owning user.                                                                 |

**As it stands today: this table has zero readers and zero writers.** `SessionService`/`SessionController`/`SessionRepository` (`src/modules/session/`) are empty stub classes — no methods, no routes. `AuthModule` does not import `SessionModule`, and `AuthService` never touches `PrismaService` for sessions (it doesn't inject `PrismaService` at all, despite `AuthModule` importing `PrismaModule` — a dead import). Refresh tokens are therefore **pure stateless JWTs**: nothing in the database ever represents "this token is currently valid" or "this token has been revoked." See [Known Gaps](#known-gaps--recommended-hardening) for the direct consequences.

---

### Guards, Strategies & Decorators

#### `JwtStrategy` (`strategies/jwt.strategy.ts`)

Passport strategy named `'jwt'`, registered as a provider in `AuthModule`.

- **Token extraction, in order**: `ExtractJwt.fromAuthHeaderAsBearerToken()` first, then a fallback reading `req.cookies.access_token`. **The second branch is currently dead** — no route in the codebase ever sets an `access_token` cookie (`login` only sets `refreshToken`), so in practice every caller must send `Authorization: Bearer <token>`.
- **Secret**: reads the *raw* env var `configService.get<string>('JWT_ACCESS_SECRET')` directly — not the `'auth.accessSecret'` namespaced value that `AuthService`/`AuthModule` use elsewhere. Works today (`ConfigService` also exposes raw `process.env` keys), but bypasses the module's own namespaced-config convention. Throws `Error('JWT_ACCESS_SECRET is not defined in environment variables')` at construction if missing — redundant with the Zod validation in `auth.env.ts` already failing boot for the same reason, but harmless belt-and-suspenders.
- `ignoreExpiration: false` — an expired token is rejected by Passport itself, surfacing as a `TokenExpiredError` that `JwtAuthGuard` maps (below).
- `validate(payload: IJwtPayload)` — requires `sub`, `email`, **and** `role` all truthy, else throws `UnauthorizedException('Invalid token payload')`. On success returns `{ id: payload.sub, email: payload.email, role: payload.role }`, which Passport attaches as `req.user`. **Note the field is `id`, not `sub`** — every controller/guard downstream reads `req.user.id`, not `req.user.sub`.

#### `JwtAuthGuard` (`guards/jwt-auth.guard.ts`)

`extends AuthGuard('jwt')`, injects `Reflector`.

- Checks `IS_PUBLIC_KEY` metadata (see `@Public()` below) via `reflector.getAllAndOverride`.
- Wraps `super.canActivate()` in a `try/catch`: on failure, a route marked `@Public()` is let through anyway; otherwise an already-thrown `HttpException` (e.g. from `JwtStrategy.validate`) is rethrown as-is, and any other error is normalized into `UnauthorizedException({ message: 'Authentication failed. Please log in again.', error: 'Unauthorized', errorCode: 'AUTH_UNAUTHORIZED' })`.
- `handleRequest(err, user, info)` maps Passport's raw failure `info` into a consistent, differentiated **body** while always answering **401**:

  | Condition                              | `errorCode`             | Message                                         |
  | :---------------------------------------- | :-------------------------- | :--------------------------------------------------- |
  | `TokenExpiredError`                       | `AUTH_TOKEN_EXPIRED`        | "Your session has expired. Please log in again."     |
  | `JsonWebTokenError` / `NotBeforeError`    | `AUTH_TOKEN_INVALID`        | "Your session is invalid. Please log in again."      |
  | Passport info message `'No auth token'`    | `AUTH_TOKEN_MISSING`        | "Please log in to continue."                          |
  | Anything else                             | `AUTH_UNAUTHORIZED`         | "Authentication failed. Please log in again."         |

  Every branch throws `UnauthorizedException` — the HTTP status code is always `401`; only `errorCode` in the body differentiates expired vs. invalid vs. missing.

#### `RolesGuard` (`guards/roles.guard.ts`)

Plain `CanActivate`, injects `Reflector`, reads `ROLES_KEY` metadata (set by `@Roles(...)`).

- No required roles declared → `true` (open to any authenticated caller).
- No `request.user` → `ForbiddenException('User session not found')`.
- No `user.role` → `ForbiddenException('User role is missing or invalid')`.
- `user.role` not in the required list → `ForbiddenException('Insufficient role privileges')`.

**Must run after `JwtAuthGuard`** — it only reads `request.user`, it never authenticates on its own. Every guarded route in the codebase applies them together, in this order: `@UseGuards(JwtAuthGuard, RolesGuard)`. This single pair (imported from `src/modules/auth/guards/`) is reused verbatim across every other module — `address`, `blog`, `category`, `combo-product`, `home`, `inventory`, `product`, `support`, `user` — there is no per-module divergence.

#### `@Public()` / `@Roles()` decorators (`src/common/decorators/auth/`)

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

**`@Public()` is fully implemented in `JwtAuthGuard` but never applied to a single route anywhere in the codebase.** There is also no global `APP_GUARD` registration (`app.module.ts`'s `providers` only registers two `APP_INTERCEPTOR`s — logging and the response envelope). Guards are applied **per-controller/per-route** instead, so a route is "public" simply by omitting `@UseGuards(...)` — which is exactly how `AuthController`'s two routes and `OtpController`'s verify route work today. The `@Public()`-bypass branch in `JwtAuthGuard` is therefore dead code as things stand, and reads as leftover scaffolding for a global-guard pattern that was never finished. There is also no dedicated `@CurrentUser()` param decorator — every controller reads `req.user` manually via `@Req()`.

---

### Config & Environment

Source: `src/modules/auth/config/auth.env.ts` (Zod schema, validated at boot) → `auth.config.ts` (`registerAs('auth', ...)`, exposed under the `'auth'` `ConfigService` namespace).

| Env var                     | Validation             | Default          | Exposed as (`auth.*`)     |
| :---------------------------- | :------------------------ | :------------------ | :---------------------------- |
| `JWT_ACCESS_SECRET`           | `z.string().min(1)`, **required, no fallback** | — | `accessSecret`               |
| `JWT_REFRESH_SECRET`          | `z.string().min(1)`, **required, no fallback** | — | `refreshSecret`               |
| `JWT_ACCESS_EXPIRES_IN`       | `z.string()`               | `'5d'`               | `accessExpiresIn`              |
| `JWT_REFRESH_EXPIRES_IN`      | `z.string()`               | `'30d'`              | `refreshExpiresIn`             |
| `JWT_REFRESH_EXPIRES_IN_MS`   | `z.coerce.number()`         | `2592000000` (30 days) | `refreshExpiresInMs`         |

Boot fails fast (Zod `.parse(process.env)`) if either secret is missing — there is no hardcoded fallback secret anywhere in code, which is the one place this module defaults to the safe choice.

**There is no `auth.nodeEnv` key.** The `'auth'` namespace's `registerAs` factory only returns the five keys above. `NODE_ENV` lives under the separate `'app'` namespace (`app.config.ts`, default `'development'`) — see [Known Gaps](#known-gaps--recommended-hardening) for why this matters directly to cookie security.

---

### Known Gaps / Recommended Hardening

Ranked roughly by how much it matters to fix before this module is trusted with production traffic.

1. **The refresh-token cookie's `secure` flag is always `false`, in every environment, including production.** `AuthController.login` computes `secure: authConfig?.nodeEnv === 'production'`, but `authConfig` (the `'auth'` namespace) has no `nodeEnv` key at all — that value lives under `'app'`. So the comparison is always `undefined === 'production'`, always `false`. The refresh token cookie can be sent over plain HTTP in production today. **Fix**: read `configService.get('app.nodeEnv')` instead.
2. **No refresh-token rotation, revocation, or reuse detection.** Refresh tokens are stateless JWTs with no backing store — the `Session` table exists in the schema but `SessionService`/`SessionController`/`SessionRepository` are empty stubs, and `AuthModule` doesn't even import `SessionModule`. A leaked refresh token is valid for its full 30-day lifetime with no way to kill it short of rotating `JWT_REFRESH_SECRET` for every user at once.
3. **No logout endpoint exists.** Nothing revokes a session or refresh token server-side — there's nothing *to* revoke, since none are tracked. Even a "clear the cookie" no-op logout route doesn't currently exist.
4. **Rate limiting is configured but not enforced.** `ThrottlerModule.forRoot([{ ttl: 60, limit: 100 }])` is registered in `app.module.ts`, but no `ThrottlerGuard` is ever applied — no `@Throttle()` decorator, no `APP_GUARD` registration — anywhere in the codebase. `/auth/login` has no brute-force protection at the framework level. The account-level `UserSecurity.loginAttempts` counter is incremented on every failed login but never read anywhere — it's a write-only counter with no lockout threshold.
5. **Refresh token is exposed twice.** `AuthController.login` both sets `refreshToken` as an `httpOnly` cookie **and** returns it in the JSON response body (`TokensResponseDto.refresh_token`). If the intent is httpOnly-cookie-based refresh security (XSS-resistant storage), returning the same value in a JS-readable response body undermines that; `RefreshTokenDto` also accepts it back via request body, doubling the attack surface.
6. **Access token TTL default (`5d`) is long for a token with no revocation path.** Combined with finding #2, a stolen access token is usable for up to 5 days with nothing the server can do to invalidate it early.
7. **`validateUser` and `refreshToken` disagree on which statuses are allowed to authenticate.** `validateUser` (used by `/login`) only special-cases `BLOCKED`/`SUSPENDED`/`PENDING_VERIFICATION` — `INACTIVE`, `DEACTIVATED`, and `ARCHIVED` fall through and are allowed to log in. `refreshToken` (used by `/refresh`) strictly requires `status === ACTIVE`. Net effect: a `DEACTIVATED` user can log in and get a fresh token pair, then get rejected the moment they try to refresh it.
8. **`refreshToken()` flattens every internal error into one generic message.** The whole method body is wrapped in `try { ... } catch { throw new UnauthorizedException('Invalid or expired refresh token') }`, so the more specific internal errors (`'Invalid token payload'`, `'User not found'`, `'Account is not active'`) are thrown but never actually reach the client — everything becomes the same 401 with the same wording, one level removed from what actually failed.
9. **No password-reset flow exists**, despite the pieces suggesting one was planned: `UserSecurity.resetToken`/`resetTokenExpires` columns, an `OTPType.PASSWORD_RESET` enum value, and a commented-out `resetToken` field in `VerifyOtpResponseDto`. `OtpService.verifyOtp()` only special-cases `OTPType.SIGNUP` — verifying a `PASSWORD_RESET` OTP burns the code but triggers no downstream action. The only password-*change* path (`UserService.updatePassword`, documented in `user.md`) requires the caller to already be authenticated and know their current password — it cannot help a locked-out user.
10. **Third-party/social login is entirely unimplemented.** `SocialAuthDto` and the `AuthProvider` enum (`GOOGLE`/`FACEBOOK`/`APPLE`) exist, and `validateUser`'s own error message references "third-party (Google, Facebook) login" — but there is no OAuth strategy, no callback route, and no code anywhere that verifies a provider token. Setting `authProvider`/`providerId` at registration (`user.md`'s `POST /create-user`) is accepted with zero verification that the caller owns that OAuth account.
11. **`@Public()` is dead code**, and its presence without a global guard is misleading — a developer reading `JwtAuthGuard` would reasonably assume some route uses `@Public()` to opt out of auth; none does. If a global `APP_GUARD` is ever added later, every currently-"public by omission" route (`/auth/login`, `/auth/refresh`, `/otp/verify-otp`) would suddenly require `@Public()` to keep working — worth fixing proactively rather than at that migration's expense.
12. **`JwtStrategy`'s cookie extractor is dead code.** It looks for an `access_token` cookie that nothing in the app ever sets — only `Authorization: Bearer` actually works.
13. **No CSRF protection on the cookie-based refresh flow.** `sameSite: 'strict'` on the `refreshToken` cookie covers most cross-site cases, but there's no CSRF token / double-submit-cookie pattern backing `POST /auth/refresh`.
14. **No `helmet()` middleware** is applied in `main.ts` — no baseline security headers (`X-Content-Type-Options`, `X-Frame-Options`, HSTS, etc.) at all.
15. **CORS is permissive**: `app.enableCors({ origin: true, credentials: true })` reflects any request origin while also allowing credentials — worth tightening to an explicit allow-list before this ships broadly, since `credentials: true` + `origin: true` together are a well-known misconfiguration pattern.
16. **`AuthModule` imports `PrismaModule` but `AuthService` never injects `PrismaService`** — dead import, harmless but worth removing.
17. **Auth's own test specs are non-functional scaffolding.** Both `auth.controller.spec.ts` and `auth.service.spec.ts` are default Nest CLI stubs (`Test.createTestingModule({ controllers: [AuthController] })` with no mocked dependencies, asserting only `toBeDefined()`) — none of the login/refresh/token-generation logic above is under test.

---

### API End Point & Business Logic

Every endpoint below is served by `AuthController` → `AuthService` → `UserService` (see [`user.md`](./user.md) for the repository layer beneath that). Both routes are prefixed `/api/v1/auth`.

#### Endpoint Overview

| Method | Path              | Access | Purpose                                                              |
| :------- | :------------------ | :------- | :------------------------------------------------------------------------ |
| `POST`  | `/auth/login`       | Public | [Authenticate with email/password, issue a token pair](#login)          |
| `POST`  | `/auth/refresh`     | Public (requires a valid refresh token, not a guard) | [Exchange a refresh token for a new token pair](#refresh-token) |

Neither route carries `@UseGuards(...)` — they're reachable pre-authentication by omission, not via `@Public()` (see [Guards, Strategies & Decorators](#guards-strategies--decorators)).

---

#### Response Shapes & Select Projections

| DTO                    | Fed to                     | Contains                                                                                                  |
| :------------------------ | :---------------------------- | :--------------------------------------------------------------------------------------------------------- |
| `LoginDto`                | `POST /auth/login` body       | `email` (`@IsEmail`), `password` (`@IsString`, `@MinLength(6)`, `@MaxLength(255)`).                        |
| `RefreshTokenDto`         | `POST /auth/refresh` body      | `refreshToken?` (`@IsOptional`) — only used as a fallback when the cookie is absent.                        |
| `TokensResponseDto`       | Both routes' response body     | `{ access_token, refresh_token }`. No `user`/profile data — the client must call `GET /user/my-profile` (see `user.md`) to hydrate account info. |
| `IJwtPayload`             | Signed into the access token   | `{ sub, email, role }` — see [Architecture Overview](#architecture-overview).                               |

No response ever includes `password` — `AuthService.validateUser` manually constructs a `UserResponseDto` field-by-field (never spreads the raw fetched-with-password object), consistent with the guarantee documented in `user.md`'s [Password/Security Handling](./user.md#passwordsecurity-handling).

---

#### Login

**`POST /api/v1/auth/login`**

**Purpose**: Authenticate with email + password, issue an access/refresh token pair.

**Access**: Public.

| Layer      | What happens                                                                                                                              |
| :--------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| Controller | `login(loginDto, ip, res)` — calls the service, then sets the `refreshToken` cookie, then returns the token pair in the body.                |
| Service    | `login(dto, ip)` → `validateUser(email, password, ip)` → `generateTokens(payload)`.                                                          |
| (via User) | `UserService.findForAuth` / `updateLoginAttempts` / `updateLoginSuccess` / `updateLastLoginTime` — see `user.md`'s [Auth & OTP Coupling](./user.md#auth--otp-coupling). |

**Business logic — in order:**

1. **`validateUser(email, password, ip)`**:
   - `userService.findForAuth(email)` — fetches the user **with password hash** (one of only two call sites in the entire codebase that do). No match → `401 UnauthorizedException('Invalid credentials')`.
   - `status === BLOCKED || SUSPENDED` → `403 ForbiddenException('Account is blocked'/'Account is suspended')`.
   - `status === PENDING_VERIFICATION` → `401 UnauthorizedException('Account is not active. Please verify your email before logging in')`.
   - No `password` set (OAuth account) → `401 UnauthorizedException('Password not set. Please use third-party (Google, Facebook) login.')`.
   - `hashService.compare(password, user.password)` fails → `userService.updateLoginAttempts(user.id)` (increments `UserSecurity.loginAttempts` — never checked anywhere, see [Known Gaps](#known-gaps--recommended-hardening)) → `401 UnauthorizedException('Invalid credentials')`.
   - Success → `userService.updateLoginSuccess(user.id, ip)` (resets `loginAttempts` to `0`, records `lastLoginIp`) then `userService.updateLastLoginTime(user.id)` (stamps `User.lastLoginAt`) — **two separate writes, not one transaction**.
   - **`status` is not required to be exactly `ACTIVE`** — any status other than the three rejected above (e.g. `INACTIVE`, `DEACTIVATED`, `ARCHIVED`) is allowed through. See [Known Gaps](#known-gaps--recommended-hardening) #7 for why this is inconsistent with `/refresh`.
2. **Build payload** — `{ sub: user.id, email: user.email, role: user.role }`.
3. **`generateTokens(payload)`** — signs the access token (`{ sub, email, role }`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`) and the refresh token (`{ sub }` only, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`) in parallel.
4. **Controller sets the cookie**:
   ```ts
   res.cookie('refreshToken', tokens.refresh_token, {
     httpOnly: true,
     secure: authConfig?.nodeEnv === 'production', // always false — see Known Gaps #1
     sameSite: 'strict',
     maxAge: /* parsed from auth.refreshExpiresInMs, falls back to the raw config value if parseInt fails */,
   });
   ```
5. **Response body** — `{ access_token, refresh_token }` (the refresh token appears in both the cookie and the body — see [Known Gaps](#known-gaps--recommended-hardening) #5).

**Response shape**: `TokensResponseDto`, envelope `{ statusCode: 200, success: true, message: 'Login successful', data: { access_token, refresh_token } }`.

| Status | Cause                                                                                                                          |
| :----- | :----------------------------------------------------------------------------------------------------------------------------- |
| `200`  | Login successful.                                                                                                              |
| `400`  | DTO validation failed (`email` not a valid email, `password` too short/long).                                                 |
| `401`  | No user with that email; **or** wrong password; **or** account `PENDING_VERIFICATION`; **or** OAuth account with no password set. |
| `403`  | Account `BLOCKED` or `SUSPENDED`.                                                                                              |

---

#### Refresh Token

**`POST /api/v1/auth/refresh`**

**Purpose**: Exchange a still-valid refresh token for a brand-new access/refresh token pair.

**Access**: Public route; effectively gated by possessing a valid refresh token rather than a guard (no `@UseGuards(...)` — token verification happens by hand inside `AuthService.refreshToken`).

| Layer      | What happens                                                                                                                        |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| Controller | `refresh(req, refreshTokenDto)` — reads the token from the cookie first, body second; calls the service; returns its result directly.       |
| Service    | `refreshToken(token)` — verify, look up the user, re-issue a token pair.                                                                    |
| (via User) | `UserService.getUserById(payload.sub)`.                                                                                                     |

**Business logic — in order:**

1. **Token source** — `req.cookies.refreshToken` if present, else `refreshTokenDto?.refreshToken` from the request body. Neither present → `400 BadRequestException('No refresh token provided')`.
2. **`jwtService.verifyAsync(token, { secret: auth.refreshSecret })`** inside a `try/catch` that wraps the entire method.
3. No `payload.sub` → `UnauthorizedException('Invalid token payload')` *(internally — see step 6)*.
4. `userService.getUserById(payload.sub)` — not found → `UnauthorizedException('User not found')` *(internally)*.
5. `user.status !== ACTIVE` → `UnauthorizedException('Account is not active')` *(internally)* — **stricter than `/login`**, see [Known Gaps](#known-gaps--recommended-hardening) #7.
6. **Every one of the internal errors above is caught by the method's own outer `try/catch`** and rethrown as the single generic `401 UnauthorizedException('Invalid or expired refresh token')` — none of the specific messages in steps 3–5 ever reach the client. See [Known Gaps](#known-gaps--recommended-hardening) #8.
7. **New payload built from the freshly-fetched user**, not the old token — `{ sub: user.id, email: user.email, role: user.role }` — so a role/email change is picked up on refresh even though the old refresh token's own payload never carried them.
8. `generateTokens(...)` — same signing logic as login.
9. **No new cookie is set here** — the response returns the new refresh token only in the JSON body; the browser's existing `refreshToken` cookie from the original login is left stale and unrotated unless the client explicitly re-sets it itself. **The old refresh token is also never invalidated** — it remains valid and reusable until its own natural expiry (see [Known Gaps](#known-gaps--recommended-hardening) #2).

**Response shape**: `TokensResponseDto`, envelope `{ statusCode: 200, success: true, message: 'Token refreshed successfully', data: { access_token, refresh_token } }`.

| Status | Cause                                                                                                                                            |
| :----- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `200`  | New token pair issued.                                                                                                                            |
| `400`  | No refresh token supplied in either the cookie or the body.                                                                                       |
| `401`  | Token invalid, malformed, expired, signed with the wrong secret, references a nonexistent user, or the user's `status !== ACTIVE` — all collapse to the same `'Invalid or expired refresh token'` message. |

---

### Module Coupling

| Module            | Relationship                                                                                                                                                                                                    |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UserModule`         | `AuthModule` imports it normally (no `forwardRef` — the dependency is one-directional). `AuthService` calls `findForAuth`, `updateLoginAttempts`, `updateLoginSuccess`, `updateLastLoginTime`, `getUserById`. See `user.md`'s [Auth & OTP Coupling](./user.md#auth--otp-coupling) for the reverse view of these same call points. |
| `OtpModule`          | **No relationship.** `AuthModule` does not import `OtpModule` and `AuthService` never references `OtpService`. OTP verification (`OtpService.verifyOtp`) calls into `UserModule` directly (`activateUser`) — Auth is not involved in the signup-verification loop at all, only in login/refresh. |
| `SessionModule`      | **No relationship**, despite `Session` existing specifically to back refresh tokens — see [Known Gaps](#known-gaps--recommended-hardening) #2–3. `AuthModule` does not import it, and `SessionService`/`SessionController` are empty stubs regardless. |
| `HashModule`         | Imported for `HashService` (bcrypt `hash`/`compare`) — used in `validateUser`'s password comparison. Hashing itself (registration, password change) happens in `UserModule`; Auth only ever *compares*. |
