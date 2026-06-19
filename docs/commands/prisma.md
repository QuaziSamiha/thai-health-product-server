
## Commands

Run all commands from `thai-health-product-server/`.

### Day-to-day schema changes

```bash
# 1. Edit the relevant prisma/schema/<domain>.prisma file(s), then generate
#    a migration + apply it locally
npx prisma migrate dev --name <short_description_of_change>

# 2. Regenerate the TypeScript client (migrate dev does this automatically,
#    but run it manually any time you only changed generator config)
npx prisma generate
```

### Inspect / validate

```bash
# Open Prisma Studio (visual data browser) against your current env
npx prisma studio

# Validate every file under prisma/schema/ (merged) — syntax + relations,
# without touching the DB
npx prisma validate

# Auto-format every file under prisma/schema/ (consistent column alignment, etc.)
npx prisma format
```

### Applying migrations elsewhere (CI / office / production)

```bash
# Applies any pending migrations, never generates new ones, never prompts
NODE_ENV=production npx prisma migrate deploy
```

### Resetting your local database

```bash
# Drops the DB, recreates it, replays every file in prisma/migrations from
# scratch, then regenerates the client. DESTROYS ALL LOCAL DATA.
npx prisma migrate reset
```

> ⚠️ Only ever run `migrate reset` against your own local dev database. Never against `.env.production` / `.env.office`. This command will refuse to run unattended for an AI agent without explicit human confirmation — that guard is intentional, don't bypass it.

### Running the app itself against a specific env

```bash
yarn start:dev      # .env.development
yarn start:local     # .env.development.local (your personal DB)
yarn start:office    # .env.office
yarn start:prod      # .env.production
```