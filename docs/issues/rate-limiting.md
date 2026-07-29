# Rate Limiting — Current State, Issues & Remediation Plan

Status: **Not enforced.** `@nestjs/throttler` is installed and configured in both `thai-health-product-server` and `thai-health-product-server-office`, but neither app ever registers the guard that enforces it. Every route in both services is currently unlimited, including `POST /auth/login` and the OTP endpoints.

This document records *what exists today*, *every defect in it*, and *the target design* — so the fix is a deliberate engineering decision, not a scramble during an incident.

Audience: whoever picks up the hardening pass. Assumes familiarity with [`docs/concepts/error-handling.md`](../concepts/error-handling.md) and [`docs/concepts/health-check.md`](../concepts/health-check.md).

---

## 1. TL;DR

| Question | Answer |
|---|---|
| Is a rate-limit library installed? | Yes — `@nestjs/throttler@^6.5.0`, both servers |
| Is it configured? | Yes — one global bucket, `ttl: 60`, `limit: 100` |
| Is it **enforced**? | **No.** No `APP_GUARD`, no `useGlobalGuards()`, no `@UseGuards(ThrottlerGuard)` anywhere |
| Effective limit on `POST /auth/login` today | Unlimited |
| Is there an account lockout instead? | No. `loginAttempts` is incremented and never read |
| Would enabling the guard as-is be correct? | **No** — see §3.2 (`ttl` unit bug) and §3.3 (in-memory storage) |
| Severity | **High.** Credential stuffing, OTP brute force, and application-layer DoS are all unmitigated at the app tier |

---

## 2. What exists today

### 2.1 File inventory

**`thai-health-product-server` (new server)**

| File | Line(s) | What's there |
|---|---|---|
| `package.json` | 35 | `"@nestjs/throttler": "^6.5.0"` |
| `src/app.module.ts` | 15, 57–62 | `ThrottlerModule.forRoot([{ ttl: 60, limit: 100 }])` |
| `src/health/health.controller.ts` | 9, 20–22 | `@SkipThrottle()` — pre-emptive probe exemption |
| `src/modules/auth/auth.service.ts` | 61 | Increments the failed-login counter |
| `src/modules/user/user.service.ts` | 269–275 | `updateLoginAttempts()` |
| `src/modules/user/repositories/user-security.repository.ts` | 52–66, 68–77 | `updateLoginMetadata()` (resets to 0), `incrementLoginAttempts()` |
| `prisma/schema/user.prisma` | 113–116 | `loginAttempts`, `lastLoginIp`, `assignedIp` — **no** `lockedUntil` |
| `src/main.ts` | — | No `trust proxy`, no edge limiter |
| `docs/concepts/health-check.md` | 117–126 | Already documents that no guard is registered |
| `docs/concepts/error-handling.md` | 398 | Already lists "No `429` mapping" as a known gap |
| `claude-doc/AUTH_USER.md` | 105 | Already documents the write-only `loginAttempts` counter |

**`thai-health-product-server-office`** — same setup, same values, different line numbers:

| File | Line(s) |
|---|---|
| `package.json` | 36 |
| `src/app.module.ts` | 9, 37–42 |
| `src/health/health.controller.ts` | 9, 22 |
| `src/modules/auth/auth.service.ts` | 57 |
| `src/modules/user/user.service.ts` | 247 |
| `src/modules/user/repositories/user-security.repository.ts` | 68–77 |

### 2.2 The configuration, verbatim

```ts
//* src/app.module.ts
ThrottlerModule.forRoot([
  {
    ttl: 60,    // * Reset counter after 60 seconds
    limit: 100, // * Allow 100 requests per IP in 60s
  },
]),
```

One unnamed (`default`) throttler, default in-memory storage, default tracker.

### 2.3 How `@nestjs/throttler` v6 actually works

Understanding the enforcement path is what makes §3 legible:

1. `ThrottlerModule.forRoot()` registers **options and a storage service**. It applies nothing on its own.
2. `ThrottlerGuard.canActivate()` is the only thing that counts requests. Without it in the request pipeline, the module is inert.
3. The guard resolves a **tracker** via `getTracker(req)`, which defaults to `return req.ip`.
4. It hashes `ControllerName-handlerName-throttlerName-tracker` into a storage key — so the bucket is **per route handler**, not per API surface.
5. On each hit it calls `storage.increment(key, ttl, limit, blockDuration, name)` and sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
6. Over the limit → sets `Retry-After` and throws `ThrottlerException` (HTTP 429).

Point 2 is the entire bug. Points 3–4 drive several of the design issues below.

---

## 3. Issues

Ranked by severity. Each is stated as *defect → evidence → impact*.

### 3.1 🔴 P0 — The throttler is never enforced

**Defect.** `ThrottlerGuard` is not registered anywhere in either service. There is no `{ provide: APP_GUARD, useClass: ThrottlerGuard }` in either `app.module.ts` providers array, no `app.useGlobalGuards(...)` in either `main.ts`, and no `@UseGuards(ThrottlerGuard)` on any controller.

**Evidence.** A repo-wide search over both `src/` trees for `APP_GUARD`, `ThrottlerGuard`, and `@Throttle` returns zero matches. `src/app.module.ts:86-90` registers two `APP_INTERCEPTOR`s and nothing else; `src/main.ts:35-47` registers a pipe and a filter and nothing else.

**Impact.** Zero requests are limited. `POST /api/v1/auth/login` accepts unbounded password guesses at whatever rate the network allows. `POST /api/v1/otp/verify-otp` accepts unbounded OTP guesses — and a 6-digit numeric OTP has only 10⁶ values, which is minutes of brute force at a few thousand req/s. The configuration in `app.module.ts` and the `@SkipThrottle()` on `HealthController` both create a **false sense of coverage** during review, which is arguably worse than having no throttler installed at all.

### 3.2 🔴 P0 — `ttl` is in milliseconds in v6; the config assumes seconds

**Defect.** `@nestjs/throttler` changed `ttl` from seconds to **milliseconds** in v5. This project is on v6.5.0. `ttl: 60` is therefore a **60-millisecond** window, not 60 seconds. The inline comment says "Reset counter after 60 seconds."

**Evidence.** `node_modules/@nestjs/throttler/dist/throttler-module-options.interface.d.ts` types `ttl: Resolvable<number>`; the storage contract and the `Retry-After`/`X-RateLimit-Reset` values it emits are milliseconds throughout v6.

**Impact.** Latent, but it detonates the moment §3.1 is fixed. The intended policy is 100 req/min; the configured policy is 100 req **per 60 ms** — roughly 1,666 req/s sustained. Someone enables the guard, sees no 429s in staging, and ships a limiter that stops nothing. This is the classic "the fix that looks like it worked" failure.

**Fix is not just `ttl: 60000`.** See §4.3 — the value belongs in validated env config, not a literal.

### 3.3 🟠 P1 — In-memory storage cannot survive more than one instance

**Defect.** No `storage` is supplied to `ThrottlerModule`, so it uses the built-in in-process `ThrottlerStorageService` — a `Map` in the Node heap.

**Impact.**
- **Horizontal scaling breaks the policy.** With *N* instances behind a load balancer, the real limit is *N × limit*, and it varies with autoscaling. The stated policy becomes unknowable.
- **Every deploy resets every bucket.** An attacker mid-brute-force gets a clean slate on each rolling restart.
- **Unbounded memory under attack.** The key space is `sha256(controller-handler-name-ip)`. A distributed source hitting many routes from many IPs grows the map on the very node it is attacking. The limiter becomes an amplifier.

This is acceptable for a single-instance deployment and *only* that. It must be a documented deployment constraint or it must be fixed — the current state does neither.

### 3.4 🟠 P1 — A single global bucket is the wrong shape for this API

**Defect.** One throttler, `limit: 100`, applied uniformly.

**Impact.** `GET /api/v1/product` (cacheable, cheap, high legitimate volume) and `POST /api/v1/auth/login` (expensive bcrypt compare, security-critical, low legitimate volume) get identical budgets. Any single number is simultaneously too tight for catalogue browsing and far too loose for credential endpoints. A product listing page issuing 8 XHRs per view will exhaust a 100/min budget in a dozen page views, while 100 password guesses per minute per IP is an entirely comfortable brute-force budget for an attacker.

Note the mitigating detail from §2.3: the guard keys per **route handler**, so the 100 is per-endpoint, not per-API. That makes the browsing case less bad and the credential case *worse* — the attacker gets a full 100/min on `login` alone, undiluted by any other traffic.

### 3.5 🟠 P1 — IP tracking is unsafe behind a proxy, and no `trust proxy` is set

**Defect.** The default tracker is `req.ip`. Express computes `req.ip` from the socket unless `trust proxy` is configured, and `main.ts` never configures it.

**Impact.** Two failure modes, and which one you get depends on deployment:

- **Deployed behind nginx / ALB / Cloudflare (the likely case).** Every request appears to originate from the proxy's IP. All users collapse into **one shared bucket**. The first 100 requests per minute from the entire internet consume the budget and everyone else gets 429. One attacker trivially locks out all legitimate users — the limiter becomes the DoS.
- **Naively "fixed" by trusting `X-Forwarded-For` unconditionally** (`trust proxy: true`). The header is client-controlled. An attacker sends a random `X-Forwarded-For` per request and gets an unlimited number of fresh buckets. The limiter is bypassed entirely.

Only the middle path is correct: trust a **specific, known** number of proxy hops. This must be decided from the actual deployment topology, not guessed.

### 3.6 🟠 P1 — `loginAttempts` is a write-only counter: there is no lockout

**Defect.** `auth.service.ts:61` calls `updateLoginAttempts()` on every failed password compare, which increments `UserSecurity.loginAttempts`. `updateLoginMetadata()` resets it to `0` on success. **Nothing anywhere reads the column.**

**Evidence.** `incrementLoginAttempts` has exactly two call sites in each service (repository → service → auth service). No query, guard, or branch anywhere compares `loginAttempts` to a threshold. Already noted at `claude-doc/AUTH_USER.md:105`.

**Impact.** The schema, the repository method, and its `//* Increments failed login attempts for security throttling.` comment all advertise a protection that does not exist. There is no lockout, no backoff, no alert, no consequence for 10,000 consecutive failures against one account. It is a per-account attack counter that nobody watches.

**Additional schema gap.** Implementing a lockout needs state the model doesn't have — `prisma/schema/user.prisma:113-116` has `loginAttempts`, `lastLoginIp`, `assignedIp` but **no `lockedUntil` and no `lastFailedLoginAt`**. Without a timestamp the counter never decays, so a user who fails twice today and three times next month eventually locks out from ordinary forgetfulness. A migration is required (§4.7).

### 3.7 🟡 P2 — 429 responses will not match the API's error envelope

**Defect.** `GlobalExceptionFilter` has no `ThrottlerException` branch. It falls through to the generic `HttpException` branch at `src/common/errors/global-exception.filter.ts:115-130`.

**Impact.** The status code is correct (429) and the envelope keys are present, but:
- `message` becomes the library's raw default, `"ThrottlerException: Too Many Requests"` — a leaked internal class name in a user-facing string, and untranslatable.
- No `errorCode` is emitted, so clients must string-match to detect throttling. Every other first-class failure mode in this API branches on a stable code (`AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_INVALID`).
- The client has no structured way to read the retry delay out of the body; it must know to look at the `Retry-After` header.

Already listed as a known gap at `docs/concepts/error-handling.md:398`.

### 3.8 🟡 P2 — The config violates this codebase's own config convention

**Defect.** `ttl` and `limit` are hardcoded literals in `app.module.ts`. Every other tunable in this project — DB, auth, health, logger — lives in a self-contained `config/<name>.env.ts` zod schema plus a `registerAs()` factory, merged into `src/config/env.validation.ts` for one fail-fast boot check.

**Impact.** Rate limits cannot differ between local, staging, and production without a code change and redeploy. During an incident — the exact moment you need to tighten a limit — the only lever is a full deploy cycle. It is also the one module in the app that reviewers can't find config for in the expected place.

### 3.9 🟡 P2 — Guard ordering determines whether per-user limits are even possible

**Defect (design, not yet a bug).** Global guards execute in registration order. Whichever pass implements this must decide deliberately where `ThrottlerGuard` sits relative to the auth guard, because the choice is mutually exclusive:

| Order | Consequence |
|---|---|
| Throttler **before** auth | Throttling protects the auth guard itself (JWT verification, bcrypt) from being hammered — but `req.user` is not populated yet, so **only IP tracking is possible** |
| Throttler **after** auth | `req.user` is available, so per-user quotas work — but every unauthenticated request pays for full JWT verification before any limit applies, and public routes like `login` get no protection at all |

**Impact if decided by accident.** Registering the throttler second and writing a `userId ?? ip` tracker looks correct and silently leaves the login endpoint — the one that most needs limiting — protected by nothing. §4.5 resolves this with two named throttlers rather than one compromise.

### 3.10 🟡 P2 — The two servers hold duplicate, independently-drifting copies

**Defect.** `thai-health-product-server` and `thai-health-product-server-office` each carry their own copy of the throttler config, the health-controller exemption, the security repository, and the exception filter.

**Impact.** Every fix in this document has to be applied and verified twice, and nothing enforces that. `docs/concepts/error-handling.md` already records this same drift risk for the filter and guard. The office server is the higher-value target — it is the admin/back-office surface — and it is the copy more likely to be forgotten.

### 3.11 🔵 P3 — Uncovered surfaces a global guard will not reach

Worth recording so nobody assumes an `APP_GUARD` closes everything:

- **`ServeStaticModule` at `/uploads`** (`app.module.ts:64-67`) is Express middleware, not a Nest route. A global `APP_GUARD` **does not run** for it. Bandwidth abuse there needs edge/CDN controls.
- **Swagger UI at `/api-doc`** is likewise outside the guard, and is currently exposed unconditionally, including in production.
- **Cost-asymmetric endpoints** — image upload, inventory batch operations, report/aggregation queries — need lower budgets than their request count suggests. A "10 requests" budget is meaningless when one request writes a 20 MB file.
- **No 429 observability.** Nothing logs or counts throttle events, so there is no signal to alert on and no data to tune limits with. The logger and `correlationId` middleware are already in place (`app.module.ts:93-97`) and should be used.
- **No tests.** Nothing asserts the guard is registered. The precise defect in §3.1 — a module imported but never applied — is invisible to the type checker, to lint, and to every existing test. It will regress again without one.

---

## 4. Target design

The organizing principle: **rate limiting is three independent layers, not one.** Conflating them is why single-`ThrottlerModule` setups fail in production.

| Layer | Stops | Where it lives |
|---|---|---|
| **Edge** — volumetric floods, L3/L4, bot nets | Traffic that must never reach Node | CDN / WAF / nginx `limit_req` — infrastructure, not this repo |
| **Application** — per-caller request budgets | Abusive-but-connected clients | `@nestjs/throttler` + `ThrottlerGuard` (§4.2–§4.6) |
| **Business** — per-identity abuse of a specific flow | Credential stuffing, OTP guessing on a known account | Account lockout, OTP attempt counters (§4.7–§4.8) |

The application layer cannot substitute for the business layer: an attacker distributing 10,000 guesses against one account across 10,000 IPs defeats *any* per-IP limit but is stopped cold by a per-account lockout. Both are required.

### 4.1 Scope decision to make first

Before any code: **is either service deployed as more than one instance today, or planned to be within 6 months?**

- **No** → in-memory storage is acceptable *for now*. Record it as an explicit deployment constraint in `documentations/PROJECT_SETUP.md` and treat Redis as P1-deferred.
- **Yes / unknown** → Redis storage is P0 and ships with the guard, not after it.

Everything else in §4 is unaffected by this answer.

### 4.2 Named throttler tiers

Replace the single bucket with named tiers. `@nestjs/throttler` v6 evaluates every configured throttler on every request and requires **all** of them to pass, so tiers compose: a short burst ceiling and a long sustained ceiling apply simultaneously.

```ts
//* src/app.module.ts
ThrottlerModule.forRootAsync({
  imports: [ConfigModule.forFeature(throttlerConfig)],
  inject: [throttlerConfig.KEY],
  useFactory: (cfg: ConfigType<typeof throttlerConfig>) => ({
    throttlers: [
      //* BURST — ABSORBS A PAGE LOAD'S PARALLEL XHRs, KILLS SCRIPTED FLOODS
      { name: 'short', ttl: cfg.shortTtlMs, limit: cfg.shortLimit },
      //* SUSTAINED — THE REAL POLICY CEILING OVER A LONGER WINDOW
      { name: 'long', ttl: cfg.longTtlMs, limit: cfg.longLimit },
    ],
    //* ALL TTLs IN MILLISECONDS — v5 CHANGED THE UNIT AND THE OLD SECONDS-BASED
    //* CONFIG SILENTLY BECAME A 60ms WINDOW. SEE docs/issues/rate-limiting.md §3.2
  }),
}),
```

Security-critical routes then narrow the tier locally:

```ts
//* src/modules/auth/auth.controller.ts
@Throttle({
  short: { limit: 5, ttl: 60_000, blockDuration: 900_000 },
  //* 5 ATTEMPTS PER MINUTE, THEN A 15-MINUTE BLOCK — blockDuration IS v6-ONLY
  //* AND IS WHAT MAKES THE PENALTY OUTLAST THE WINDOW
})
@Post('login')
```

`blockDuration` is the important v6 feature here: without it, an attacker over the limit simply waits out one `ttl` and resumes at full rate, so the sustained cost of an attack is only ~50% throughput. With it, exceeding the limit is genuinely expensive.

### 4.3 Config module, following the existing convention

Rate limits are operational tunables and must be env-driven, per §3.8. Mirror `src/health/config/` exactly:

```
src/common/throttler/config/throttler.env.ts     //* ZOD SCHEMA — THROTTLE_* VARS
src/common/throttler/config/throttler.config.ts  //* registerAs('throttler', ...)
src/common/throttler/throttler.module.ts         //* forRootAsync + APP_GUARD WIRING
src/common/throttler/guards/app-throttler.guard.ts
```

```ts
//* src/common/throttler/config/throttler.env.ts
export const throttlerEnvSchema = z.object({
  THROTTLE_ENABLED: z.coerce.boolean().default(true),
  THROTTLE_SHORT_TTL_MS: z.coerce.number().int().positive().default(10_000),
  THROTTLE_SHORT_LIMIT: z.coerce.number().int().positive().default(30),
  THROTTLE_LONG_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LONG_LIMIT: z.coerce.number().int().positive().default(200),
  THROTTLE_AUTH_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(5),
  THROTTLE_AUTH_BLOCK_MS: z.coerce.number().int().positive().default(900_000),
  THROTTLE_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  THROTTLE_REDIS_URL: z.string().url().optional(),
});
```

Then one line in `src/config/env.validation.ts`:

```ts
const envSchema = appEnvSchema
  .merge(databaseEnvSchema)
  .merge(authEnvSchema)
  .merge(healthEnvSchema)
  .merge(loggerEnvSchema)
  .merge(throttlerEnvSchema);   //* ← ADD
```

Naming the vars in **milliseconds** (`_TTL_MS`) is deliberate: it makes §3.2's unit bug unrepresentable at the config layer.

`THROTTLE_ENABLED` exists so the limiter can be disabled in e2e test runs and killed in production without a code deploy if it ever misfires. Wire it through `skipIf`, not through conditional module registration — conditional registration changes the DI graph between environments, which is exactly how "works in staging" bugs are born.

### 4.4 Distributed storage

If §4.1 answered "yes":

```bash
yarn add @nest-lab/throttler-storage-redis ioredis
```

```ts
storage: new ThrottlerStorageRedisService(cfg.redisUrl),
```

Verify the storage package's peer-dependency range against `@nestjs/throttler@6.5.0` before adopting — v5/v6 changed the `ThrottlerStorage.increment()` signature (it gained `blockDuration` and `throttlerName`), and a storage adapter built for v4 will typecheck-fail or silently misbehave.

**Non-negotiable:** Redis becoming unavailable must **not** take the API down. Decide the failure mode explicitly and write it in the code as a comment — fail-open (serve the request unthrottled, log loudly) is the right default for a commerce API; fail-closed turns a cache outage into a full outage.

### 4.5 Custom guard: proxy-aware tracker, resolving §3.5 and §3.9

```ts
//* src/common/throttler/guards/app-throttler.guard.ts
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  //* TRACK AUTHENTICATED CALLERS BY USER ID SO ONE NAT'd OFFICE DOESN'T SHARE ONE
  //* BUDGET, AND SO A STOLEN-TOKEN ABUSE PATTERN CAN'T BE HIDDEN BY ROTATING IPs.
  //* FALLS BACK TO IP FOR PUBLIC ROUTES — WHICH IS EVERY ROUTE IF THIS GUARD RUNS
  //* BEFORE THE AUTH GUARD. SEE docs/issues/rate-limiting.md §3.9
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
  }
}
```

And in `main.ts`, driven by `THROTTLE_TRUST_PROXY_HOPS`:

```ts
//* EXPRESS MUST BE TOLD HOW MANY PROXY HOPS ARE IN FRONT OF IT OR req.ip IS THE
//* LOAD BALANCER'S IP AND EVERY CLIENT SHARES ONE BUCKET. NEVER SET THIS TO `true`
//* — X-Forwarded-For IS CLIENT-CONTROLLED AND BLIND TRUST MAKES THE LIMIT BYPASSABLE
//* BY SPOOFING A FRESH IP PER REQUEST.
const hops = configService.get<number>('throttler.trustProxyHops')!;
if (hops > 0) {
  app.getHttpAdapter().getInstance().set('trust proxy', hops);
}
```

The hop count must come from the real topology (Cloudflare → ALB → app is 2; nginx on the same host is 1; direct exposure is 0). Getting this wrong in either direction reproduces one of the two failure modes in §3.5, so verify it empirically after deploy by logging `req.ip` for a request from a known external address.

**On ordering (§3.9), the recommendation is: register `ThrottlerGuard` first, keyed by IP, and add per-user quotas as a second, separately-registered throttler after the auth guard if and when they're needed.** Protecting the auth path itself is worth more than per-user precision on already-authenticated traffic.

### 4.6 429 mapping in `GlobalExceptionFilter`

Add a branch **before** the generic `HttpException` fallback at `global-exception.filter.ts:115`:

```ts
} else if (exception instanceof ThrottlerException) {
  statusCode = HttpStatus.TOO_MANY_REQUESTS;
  message = 'Too many requests. Please try again shortly.';
  error = 'Rate Limit Exceeded';
  errorCode = 'RATE_LIMIT_EXCEEDED';
}
```

This closes the gap already listed at `docs/concepts/error-handling.md:398`. Note `ThrottlerException extends HttpException`, so branch order is load-bearing for the same reason `TokenExpiredError` must precede `JsonWebTokenError` (§4 of that document) — placed after the generic branch, it is unreachable.

Also: consider echoing the retry delay into the body. Clients already have to parse this envelope; making them read a header for one field is an avoidable asymmetry.

### 4.7 Account lockout — make `loginAttempts` mean something

Fixes §3.6. Requires a migration, because the current model cannot express "locked until".

```prisma
model UserSecurity {
  // ... existing fields
  loginAttempts     Int       @default(0)
  lastFailedLoginAt DateTime? //* ENABLES DECAY — WITHOUT IT THE COUNTER IS CUMULATIVE FOREVER
  lockedUntil       DateTime? //* SET ON THRESHOLD BREACH; CHECKED BEFORE THE PASSWORD COMPARE
}
```

Then in `auth.service.ts`, ahead of the `hashService.compare()` at line 59:

1. If `lockedUntil` is in the future → throw 401 with a *generic* message (see below).
2. If `lastFailedLoginAt` is older than the decay window → reset `loginAttempts` to 0 first.
3. On failure, increment; at the threshold set `lockedUntil = now + lockWindow`.
4. On success, clear all three (`updateLoginMetadata()` already resets the counter — extend it).

Three details that separate a correct implementation from a naive one:

- **Do not tell the caller the account is locked.** "Account locked" on a wrong password is a *user enumeration oracle* — it confirms the address is registered. Return the same `Invalid credentials` as any other failure, and notify the real account owner by email instead. This is the same reasoning the codebase already applies to `login`'s existing generic-credentials message.
- **Prefer exponential backoff over a hard lock.** A hard lock is itself a denial-of-service vector: anyone who knows a victim's email can lock them out on demand. Escalating delay (1s, 2s, 4s, … capped) makes brute force infeasible without handing attackers a lockout weapon. If a hard lock is chosen anyway, keep the window short (15 min) and always provide a self-service unlock via the existing reset-token flow.
- **Increment outside the request transaction.** The counter must persist even when the surrounding operation rolls back, or a failed attempt that errors later leaves no trace.

### 4.8 OTP-specific protection

`POST /otp/verify-otp` needs its own budget independent of the global tier, keyed by **the target identity, not the caller's IP** — otherwise an attacker rotating IPs still gets unlimited guesses at one victim's code.

- Cap verification attempts **per OTP record** (e.g. 5), then invalidate the code and force a resend. This is the single highest-value control on that endpoint and it needs no rate limiter at all — it's a column on the OTP row.
- Cap issuance per email/phone per hour, with a minimum resend cooldown. There is currently **no resend cooldown anywhere in either codebase** (a search for `cooldown`/`resend` returns nothing in `src/`), which means the mail path is also an outbound-spam vector and a real cost line.
- Keep OTP codes short-lived and single-use; a used code must be immediately unusable.

### 4.9 Observability — and why it needs a log management platform

**Rate limiting cannot be tuned without telemetry.** Every limit in §5 is a guess until real traffic contradicts it, and the two failure modes look identical from inside the process:

| What you see | "We are under attack" | "Our limits are too tight" |
|---|---|---|
| 429 rate | Spikes | Steadily elevated |
| Distinct trackers hitting the limit | Few, or thousands of one-shot IPs | Many, each tripping repeatedly |
| Endpoints affected | Concentrated on `login` / `verify-otp` | Spread across read endpoints |
| Correct response | Tighten, block, escalate to the edge layer | **Loosen immediately** |

Getting this backwards is expensive in both directions: tightening during a false positive drops paying customers, loosening during a real attack hands the attacker the win. Distinguishing them requires *aggregated* 429 data across time and across instances — which a log file on one box cannot give you.

#### What to log on every 429

Log at `warn` through the existing Winston logger:

```ts
//* EVERY FIELD HERE EXISTS TO ANSWER ONE TUNING QUESTION. DO NOT LOG THE RAW TRACKER
//* VALUE IF IT IS A USER ID WITHOUT CONFIRMING IT CLEARS THE PROJECT'S PII POLICY —
//* THE HASHED STORAGE KEY IS USUALLY SUFFICIENT FOR CORRELATION.
{
  message: 'Rate limit exceeded',
  throttler: 'short' | 'long' | 'auth',  //* WHICH TIER FIRED — TELLS YOU WHICH KNOB TO TURN
  route: '/api/v1/auth/login',           //* WHERE THE PRESSURE IS
  method: 'POST',
  tracker: 'ip:1.2.3.4' | 'user:42',     //* CONCENTRATED VS. DISTRIBUTED
  totalHits: 101,                        //* HOW FAR OVER — 101 IS A BUSY USER, 40,000 IS AN ATTACK
  limit: 100,
  ttlMs: 60_000,
  correlationId,                         //* STAMPED AUTOMATICALLY — SEE BELOW
}
```

`correlationId`, `userId`, and `role` are added to every line for free by the enrichment format in `src/shared/logger/winston-logger.factory.ts:30-41`, because `CorrelationIdMiddleware` and `RequestContextMiddleware` are already wired for all routes (`app.module.ts:93-97`). Nothing extra is needed to get request tracing on throttle events.

#### The logging module is already platform-ready — with one gap

`src/shared/logger` was built in a way that makes centralized log management nearly a config change:

| Requirement of every log platform | Status |
|---|---|
| Structured JSON output | ✅ `jsonConsole` defaults to `true` in production (`config/logger.config.ts:19`) |
| Stable correlation key per request | ✅ `AsyncLocalStorage`, `winston-logger.factory.ts:30-41` |
| Secrets stripped **before** the transport | ✅ `redactionFormat`, `winston-logger.factory.ts:49-58` |
| One structured access line per request | ✅ `method`, `path`, `statusCode`, `durationMs`, `ip` (`logging.interceptor.ts:49-56`) |
| `service` / `env` / `version` on every line | ❌ **Missing** — see below |

Redaction running before the transports is the load-bearing detail: it means shipping logs to a third-party vendor does not export plaintext passwords or tokens. That ordering must be preserved by anything added here.

**The gap:** no line carries a `service`, `env`, or `version` field. With two services (`thai-health-product-server` and `-office`) shipping into one platform, there is no way to answer "was that 429 on the storefront or the back office?" — and every platform's UI, alerting, and retention policy is keyed on a service dimension. Fix it once in the factory:

```ts
//* src/shared/logger/winston-logger.factory.ts — buildWinstonModuleOptions's return
return {
  //* STAMPED ONTO EVERY LINE. LOG PLATFORMS INDEX ON THESE THREE AND BECOME
  //* UNUSABLE ONCE MORE THAN ONE SERVICE OR ENVIRONMENT SHIPS TO THE SAME BACKEND.
  defaultMeta: {
    service: config.serviceName,   //* NEW LOG_SERVICE_NAME ENV VAR
    env: config.env,
    version: process.env.npm_package_version,
  },
  transports,
};
```

Add `LOG_SERVICE_NAME` to `src/shared/logger/config/logger.env.ts`, following the same self-contained-config convention the module already uses. Two smaller follow-ups: nest errors under an `error` object (`error.message`, `error.stack_trace`) rather than the flat `stack` key `format.errors({ stack: true })` produces, since no platform renders a stack viewer or groups errors without it; and commit to one field convention — **ECS** or **OpenTelemetry** — before retention builds up, because renaming fields later silently breaks every saved query and dashboard built on the old names.

#### Ship from stdout with a collector — not from a Winston transport

This is the decision that determines whether the setup survives an incident. **Do not add `winston-cloudwatch`, `winston-elasticsearch`, or a Datadog transport to the factory.** Write JSON to stdout and let a collector agent ship it.

| | In-process Winston transport | stdout → collector agent |
|---|---|---|
| Network I/O | Inside the request path, competing with request handling | Separate process |
| Vendor outage | Buffers in the Node heap, or blocks, or drops silently | The agent's problem; the app never notices |
| Process crash / OOM kill | Whatever was still batched is **lost** — exactly the lines explaining the crash | Already written; the collector picks up |
| Backpressure | Your event loop | The agent, with a disk buffer |
| Swapping vendors | Code change + redeploy | Config change |
| Credentials | API key inside the application | In the agent |

The crash row is the one that matters here. Under the exact conditions this document is about — an attack driving memory or event-loop pressure — an in-process transport drops the logs describing the attack. That is the same class of mistake as §3.3's in-memory storage: a control that fails precisely when it is needed.

Practical consequence for this project: in production, **turn the file transports off and keep JSON console on.**

```bash
LOG_FILE_ENABLED=false
LOG_ERROR_FILE_ENABLED=false
LOG_CONSOLE_ENABLED=true
LOG_JSON_CONSOLE=true
```

All four flags already exist in `logger.env.ts:23-26` — this is configuration, not code. Files plus a log platform is redundant, and `DailyRotateFile` writing inside a container is a well-known way to fill a disk.

**Caveat:** neither repo currently contains a `Dockerfile` or any deployment manifest. If the target is a bare VPS under PM2 rather than a container, invert this — keep the file transports and point the collector (Filebeat, the Datadog Agent's file tail, or the CloudWatch agent) at `LOG_DIR`. Both paths are valid. What is not valid is doing both at once.

#### Choosing a platform

| | Setup cost | Query UX | Ops burden | Bill shape | Fits this project when |
|---|---|---|---|---|---|
| **CloudWatch Logs** | Lowest — `awslogs` driver or CW agent picks up stdout; IAM handles auth | Weakest; Logs Insights does parse JSON natively | None | Cheapest ingest | Already on AWS |
| **Datadog** | Low — install the Agent, set `logs_enabled`, `DD_SERVICE`/`DD_ENV`/`DD_VERSION` | Best by a wide margin; live tail, log-to-trace correlation, anomaly monitors | None | Per-GB ingested **and** per-million indexed — most expensive | Want it to work today and can cap spend |
| **ELK / Elastic** | Medium — Filebeat → Elasticsearch → Kibana; `@elastic/ecs-winston-format` gives ECS naming free | Strong | **High** — shard sizing, ILM retention, JVM heap, security patching | Self-hosted infra | Already running Elastic for something else |
| **Grafana Loki** | Medium-low — one container, label-indexed rather than full-text | Good enough for "find the request with this correlationId" | Low | Cheapest to self-host | Cost-sensitive and willing to run one container |

**Recommendation.** If the stack is on AWS, use **CloudWatch** — an hour of integration, and because the logs are already structured JSON, migrating to something richer later costs nothing. If not on AWS, **Grafana Loki** is the honest fit at this project's scale; ELK is more cluster than a two-service application justifies. Choose **Datadog** if the log-to-trace correlation is worth the bill — and if so, set a daily ingest quota on day one.

Whatever is chosen, one existing detail already protects the budget: health probes are logged at `verbose`, not `info` (`logging.interceptor.ts:58-62`), so orchestrator polling every few seconds does not become the largest line on the invoice. Preserve that when tuning log levels.

#### What to build once logs are centralized

1. **A saved query** on `errorCode: RATE_LIMIT_EXCEEDED`, grouped by `throttler`, `route`, and `tracker` — this is the tuning dashboard for §5, and the reason §4.6 emits a stable `errorCode` instead of a matchable string.
2. **Two alerts, not one** — a spike alert (attack) and a sustained-elevated alert (limits too tight). One threshold cannot detect both, per the table opening this section.
3. **A correlation-ID lookup path.** `docs/concepts/error-handling.md` §13 notes `correlationId` is not in the error response body. Adding it means a user can read an ID off an error screen and support can retrieve the exact request — the single highest-value thing centralized logging buys.
4. **A counter metric** on the same 429 event if/when a metrics pipeline exists. Logs answer "what happened to this request"; metrics answer "how often" far more cheaply at high cardinality.

This work is not a prerequisite for shipping Phase 1 — but Phase 1's limits stay guesses until it lands, so it belongs in Phase 2 rather than "later."

### 4.10 Tests

The specific defect in §3.1 must become impossible to reintroduce:

1. **Registration test** — assert the compiled `AppModule` provides `APP_GUARD` with the throttler guard. One assertion; it is the entire lesson of this document.
2. **Behavioral e2e** — hit a throttled route `limit + 1` times, assert the last response is 429, that the body matches the standard envelope with `errorCode: 'RATE_LIMIT_EXCEEDED'`, and that `Retry-After` and `X-RateLimit-*` are present.
3. **Unit-test the window arithmetic** — assert a route configured for 60 seconds rejects on the 61st second boundary, not the 61st millisecond. This test is what would have caught §3.2.
4. **Tracker test** — with `trust proxy` configured, two requests carrying different `X-Forwarded-For` values must land in different buckets; with it unconfigured, spoofed headers must be ignored.
5. **Health exemption test** — hammer `/health/live` past the limit and assert it still returns 200. The `@SkipThrottle()` is currently untested and unexercised, since no guard runs.

---

## 5. Proposed limits

Starting values, to be tuned from real traffic once §4.9 provides data. Deliberately conservative-but-not-punitive: the goal is to make abuse expensive without generating support tickets.

| Endpoint group | Tier | Limit | Window | Block | Rationale |
|---|---|---|---|---|---|
| `POST /auth/login` | `auth` | 5 | 1 min | 15 min | Bcrypt-expensive, security-critical. 5/min is far above human behavior |
| `POST /auth/refresh` | `auth` | 20 | 1 min | — | Legitimate clients refresh rarely; bursts indicate a token-replay loop |
| `POST /otp/verify-otp` | `auth` | 5 | 5 min | 15 min | Plus a hard per-OTP attempt cap (§4.8) |
| OTP issuance / resend | `auth` | 3 | 1 hour | — | Per identity, not per IP. Also caps outbound mail cost |
| `POST /user/create-user` | `auth` | 3 | 1 hour | — | Signup spam and mail-cost control |
| Password reset request | `auth` | 3 | 1 hour | — | Same enumeration and mail-cost concerns |
| Read endpoints (product, category, blog, home) | `short` + `long` | 30 / 200 | 10 s / 1 min | — | Must absorb a page's parallel XHRs without tripping |
| Write endpoints (inventory, combo, support) | `long` | 60 | 1 min | — | Authenticated, per-user tracked |
| File upload | dedicated | 10 | 1 min | — | Cost is bytes, not request count |
| `/health/*` | exempt | — | — | — | Already `@SkipThrottle()`d — see `docs/concepts/health-check.md` §2.7 |

---

## 6. Implementation plan

Sequenced so that no step ships a change that is wrong on its own.

### Phase 0 — Decide (blocking, ~30 min)

- [ ] Instance count now and in 6 months → determines §4.1 (Redis in P1 or deferred).
- [ ] Real proxy topology → determines `THROTTLE_TRUST_PROXY_HOPS`.
- [ ] Lockout policy: exponential backoff (recommended) vs. hard lock.
- [ ] Which server first. **Recommendation: `-office`.** It is the admin surface, its blast radius is larger, and its smaller traffic profile makes a misconfigured limit cheaper to discover.

### Phase 1 — Make the limiter real (P0)

- [ ] `src/common/throttler/` config module per §4.3; merge schema into `env.validation.ts`.
- [ ] Convert to `forRootAsync` with named `short`/`long` tiers, **all TTLs in ms** (§3.2).
- [ ] `AppThrottlerGuard` (§4.5) + `trust proxy` in `main.ts`.
- [ ] Register `{ provide: APP_GUARD, useClass: AppThrottlerGuard }` — first in the guard order (§3.9).
- [ ] `ThrottlerException` branch in `GlobalExceptionFilter`, ahead of the generic `HttpException` branch (§4.6).
- [ ] `@Throttle()` on `login`, `refresh`, `verify-otp`, `create-user` per §5.
- [ ] Tests 1, 2, 3, 5 from §4.10.
- [ ] Redis storage **if** Phase 0 said multi-instance.

**Acceptance:** 101 rapid requests to a listing endpoint yield a 429 with `errorCode: 'RATE_LIMIT_EXCEEDED'`; `/health/live` never 429s; a request from a known external IP logs that IP, not the proxy's.

### Phase 2 — Business-layer controls (P1)

- [ ] Migration: `lastFailedLoginAt`, `lockedUntil` on `UserSecurity`.
- [ ] Lockout/backoff logic in `auth.service.ts`, with a non-enumerating error message (§4.7).
- [ ] Per-OTP attempt cap + issuance cooldown (§4.8).
- [ ] 429 logging with `correlationId` (§4.9).

### Phase 3 — Parity and hardening (P2)

- [ ] Apply Phases 1–2 to the second server; diff both to confirm parity (§3.10).
- [ ] Edge-layer limits for `/uploads` and `/api-doc`; gate Swagger behind non-production or auth.
- [ ] Document the deployment constraint (single-instance vs. Redis) in `documentations/PROJECT_SETUP.md`.
- [ ] Tune from Phase 2's telemetry; record the final numbers back into §5.

---

## 7. Rollout risk

Enabling a limiter is a **customer-facing change** and the failure mode is silent: legitimate users get 429s and simply leave. Mitigate:

1. **Start loose.** Ship Phase 1 with limits ~3× the intended target. Tighten only once §4.9's data shows the real p99 request rate per client.
2. **Watch the frontends first.** The client apps in this repo may fan out more parallel requests per page than anyone expects. Measure before choosing `short`.
3. **Keep the kill switch reachable.** `THROTTLE_ENABLED=false` must revert the behavior with a restart, not a deploy.
4. **Verify `trust proxy` in the real environment.** It cannot be validated locally — there is no proxy in front of `localhost`. A staging deploy that logs `req.ip` for a known external client is the only real test.
5. **Expect the office server's usage pattern to differ.** Admin tools do bulk operations; limits calibrated on storefront traffic will strangle them.

---

## 8. Open questions

| Question | Blocks | Owner |
|---|---|---|
| Multi-instance now or soon? | §4.1, Redis scope | Infra |
| Exact proxy hop count in production? | §4.5 correctness | Infra |
| Backoff vs. hard lockout? | §4.7 | Product + Security |
| Is Redis already available in this stack? | §4.4 | Infra |
| Should the two servers share a package instead of duplicating? | §3.10, and the same drift already noted for the error filter | Eng lead |
| Is `/uploads` fronted by a CDN today? | §3.11 | Infra |

---

## 9. References

- `docs/concepts/error-handling.md` §13 — the `429` mapping gap, already recorded
- `docs/concepts/health-check.md` §2.7 — why `@SkipThrottle()` is on `HealthController` despite no guard existing
- `claude-doc/AUTH_USER.md` §105 — the write-only `loginAttempts` counter
- `@nestjs/throttler` v6 — `blockDuration`, named throttlers, and the millisecond `ttl` unit introduced in v5
- OWASP: *Blocking Brute Force Attacks*, *Authentication Cheat Sheet* (account-lockout trade-offs and user-enumeration avoidance)
