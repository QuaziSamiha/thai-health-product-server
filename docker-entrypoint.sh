#!/bin/sh
#* ═════════════════════════════════════════════════════════════════════════
#* CONTAINER ENTRYPOINT — SCHEMA CONVERGENCE, THEN HAND OFF TO THE CMD.
#*
#* THE APP ITSELF NEVER MIGRATES. THIS SCRIPT DOES, EXACTLY ONCE PER CONTAINER
#* START, BEFORE NODE EVER BINDS A PORT — SO THE PROCESS THAT SERVES TRAFFIC IS
#* NEVER RACING A DDL STATEMENT.
#* ═════════════════════════════════════════════════════════════════════════
set -eu

log() { echo "[entrypoint] $*"; }

#* ─────────────────────────────────────────────────────────────────────────
#* GATE 0 — NORMALISE "SET BUT EMPTY" OPTIONAL VARS TO GENUINELY UNSET.
#*
#* COMPOSE CANNOT OMIT A KEY CONDITIONALLY: `FOO: ${FOO:-}` ALWAYS ARRIVES,
#* AS "" WHEN THE .env ENTRY IS BLANK. THAT IS NOT THE SAME THING AS UNSET TO
#* ZOD — env.validation.ts DECLARES GOOGLE_CLIENT_ID AS
#* `z.string().min(1).optional()`, WHICH ACCEPTS `undefined` BUT **REJECTS ""**,
#* SO A DEPLOYMENT THAT SIMPLY HAS NO GOOGLE OAUTH CONFIGURED WOULD FAIL BOOT
#* VALIDATION OUTRIGHT. MAIL_PORT HAS THE MIRROR-IMAGE PROBLEM: z.coerce.number()
#* TURNS "" INTO 0 AND THE MAILER WOULD DIAL PORT 0 INSTEAD OF ITS 587 DEFAULT.
#*
#* SCOPED TO A KNOWN LIST — A BLANKET SWEEP COULD SILENTLY DROP A VAR WHERE ""
#* IS A MEANINGFUL VALUE.
#* ─────────────────────────────────────────────────────────────────────────
#* printenv EXITS NON-ZERO WHEN THE VAR IS UNSET AND PRINTS AN EMPTY LINE WHEN
#* IT IS SET-BUT-EMPTY — WHICH IS EXACTLY THE DISTINCTION WE NEED. DELIBERATELY
#* NOT `eval "v=\${$var}"`: MAIL_PASSWORD LEGITIMATELY CONTAINS GLOB AND QUOTE
#* CHARACTERS THAT eval WOULD MANGLE OR EXECUTE.
for var in GOOGLE_CLIENT_ID MAIL_HOST MAIL_PORT MAIL_USERNAME MAIL_PASSWORD \
           MAIL_FROM SEED_ADMIN_PASSWORD SEED_SUPER_ADMIN_PASSWORD \
           SEED_CUSTOMER_PASSWORD; do
  if value=$(printenv "$var") && [ -z "$value" ]; then
    unset "$var"
    log "unset empty optional var: $var"
  fi
done
unset value

#* ─────────────────────────────────────────────────────────────────────────
#* GATE 1 — DATABASE REACHABILITY.
#* COMPOSE'S `depends_on: condition: service_healthy` ALREADY WAITS FOR
#* pg_isready, BUT THIS IMAGE MUST ALSO BE CORRECT WHEN RUN OUTSIDE COMPOSE
#* (KUBERNETES, `docker run`, CI). POLLING HERE COSTS NOTHING WHEN THE DB IS
#* ALREADY UP AND SAVES A CRASH-LOOP WHEN IT ISN'T.
#* ─────────────────────────────────────────────────────────────────────────
DB_WAIT_TIMEOUT="${DB_WAIT_TIMEOUT:-60}"
if [ -n "${DATABASE_URL:-}" ]; then
  log "waiting up to ${DB_WAIT_TIMEOUT}s for the database to accept connections..."
  elapsed=0
  until node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    c.connect().then(() => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));
  " 2>/dev/null; do
    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$DB_WAIT_TIMEOUT" ]; then
      log "ERROR: database unreachable after ${DB_WAIT_TIMEOUT}s — giving up."
      exit 1
    fi
    sleep 2
  done
  log "database is accepting connections."
fi

#* ─────────────────────────────────────────────────────────────────────────
#* GATE 2 — MIGRATIONS.
#* `migrate deploy` IS THE ONLY SAFE COMMAND FOR AN AUTOMATED CONTEXT:
#* `migrate dev` IS INTERACTIVE (IT PROMPTS, AND WILL HANG A CONTAINER
#* FOREVER) AND CAN DECIDE TO RESET THE DATABASE. deploy ONLY EVER APPLIES
#* PENDING MIGRATIONS FORWARD.
#*
#* ON A FRESH VOLUME THIS APPLIES THE WHOLE HISTORY FROM ZERO. IF YOU POINT
#* THIS CONTAINER AT A PRE-EXISTING DATABASE WHOSE _prisma_migrations TABLE
#* DOES NOT MATCH prisma/migrations, deploy WILL REFUSE TO RUN — THAT IS THE
#* CORRECT BEHAVIOUR, NOT A BUG. SET RUN_MIGRATIONS=false AND RECONCILE THE
#* HISTORY BY HAND (`prisma migrate resolve --applied <name>`).
#* ─────────────────────────────────────────────────────────────────────────
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  log "applying pending migrations (prisma migrate deploy)..."
  ./node_modules/.bin/prisma migrate deploy
  log "migrations applied."
else
  log "RUN_MIGRATIONS=false — skipping migrations."
fi

#* ─────────────────────────────────────────────────────────────────────────
#* GATE 3 — SEED (OPT-IN, DEFAULT OFF).
#* prisma/seed.ts IS IDEMPOTENT-BY-UPSERT, BUT IT MINTS ADMIN ACCOUNTS FROM
#* SEED_*_PASSWORD, SO IT STAYS OFF UNLESS EXPLICITLY REQUESTED.
#* ─────────────────────────────────────────────────────────────────────────
if [ "${RUN_SEED:-false}" = "true" ]; then
  log "seeding database (prisma/seed.ts)..."
  ./node_modules/.bin/tsx prisma/seed.ts
  log "seed complete."
fi

log "starting: $*"
exec "$@"
