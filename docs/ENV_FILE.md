

I am working on a **NestJS backend project** and need a clean, scalable **environment configuration setup** across multiple environments and developer workflows.

Set up the following structure and files **strictly following NestJS conventions** using `@nestjs/config` with `ConfigModule` — do not introduce any additional env management libraries unless already present in the project.

---

**⚠️ GLOBAL COMMENT CONVENTION — ENFORCE ACROSS ALL FILES WITHOUT EXCEPTION**

Always write every comment strictly in the following format: `//* COMMENT` — where the prefix is always `//*` followed by a single space, and every letter in the comment text must be **fully UPPERCASED** with no exceptions across all files.

---

**Task 1 — Environment Files Setup**

Create the following `.env` files with appropriate variables for each context:

| File | Purpose |
|---|---|
| `.env.development.local` | **Developer A** — uses personal local database and local machine IP |
| `.env.development` | **Developer B** — shared dev config, develops the project at a given time |
| `.env.office` | Office/internal environment — points to office server DB (`192.168.0.221`) |
| `.env.production` | Production — live database, live services, secrets either populated or commented out |

Each file must include the following variables:

- `DATABASE_URL` — full PostgreSQL connection string
- `NODE_ENV` — set to the correct label per environment
- `PORT`
- `API_PREFIX`
- `BASE_URL`
- `ALLOWED_ORIGINS`
- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_SECRET`
- `JWT_REFRESH_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN_MS`
- `MAIL_DRIVER`
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_ENCRYPTION`
- `MAIL_FROM`

Use the following as the **reference baseline** for variable names, values, and structure — populate each env file with appropriate values derived from this:

```dotenv
//* DATABASE — OFFICE SERVER CREDENTIALS
//* DB_USER=tsp_ecommerce
//* DB_PASSWORD=tsp_ecommerce
//* DB_HOST=192.168.0.221
//* DB_PORT=5432
//* DB_NAME=tsp_ecommerce
DATABASE_URL="postgres://tsp_ecommerce:tsp_ecommerce@192.168.0.221:5432/tsp_ecommerce?schema=public"

//* LOCAL DB CONFIGURATION
//* DATABASE_URL="postgresql://postgres:muqit1234@localhost:5432/thp_ecommerce?schema=public"
DATABASE_URL="postgres://postgres:samiha25@localhost:5432/thp_ecommerce?schema=public"

NODE_ENV=development
PORT=8000
API_PREFIX=api/v1
BASE_URL=http://localhost:8000
ALLOWED_ORIGINS=http://localhost:8000

//* JWT CONFIGURATION — KEY GENERATED USING BCRYPT WITH 12 ROUNDS, CONVERTED TO HEX STRING
JWT_ACCESS_SECRET=beb705cc...
JWT_ACCESS_EXPIRES_IN=5d
JWT_REFRESH_SECRET=fe39ce6c...
JWT_REFRESH_EXPIRES_IN=30d
JWT_REFRESH_EXPIRES_IN_MS=2592000000

//* MAIL SERVICE CONFIG — SMTP SERVER FOR ATI LIMITED
MAIL_DRIVER=smtp
MAIL_HOST=mail.atilimited.net
MAIL_PORT=587
MAIL_USERNAME=atidev@atilimited.net
MAIL_PASSWORD='-A*j~[ugH[L8'
MAIL_ENCRYPTION=tls
MAIL_FROM=atidev@atilimited.net
```

---

**Task 2 — Environment-Specific Variable Rules**

| Variable | `.env.development.local` | `.env.development` | `.env.office` | `.env.production` |
|---|---|---|---|---|
| `DATABASE_URL` | Developer A's local DB | Developer B's local DB | `192.168.0.221` office DB | Live DB — comment out if unknown |
| `BASE_URL` | `localhost:8000` | `localhost:8000` | Office machine IP | Live domain |
| `ALLOWED_ORIGINS` | `localhost:8000` | `localhost:8000` | Office machine IP | Live domain |
| `NODE_ENV` | `development` | `development` | `development` | `production` |
| `MAIL_*` | ATI SMTP shared across all | same | same | Live SMTP or commented out |

For `.env.production`:
- Populate all variables with realistic live values where inferable
- For unavailable or secret values, comment them out using `//* VARIABLE_NAME=value`
- Never leave any variable as an empty string
- Group all variables under `//* SECTION HEADER` comments

---

**Task 3 — Custom yarn Scripts**

In `package.json`, define the following scripts:

| Command | Behavior |
|---|---|
| `yarn start` | **Must** run `node dist/main` — production start, hard requirement |
| `yarn start:dev` | Runs with `.env.development` using `NODE_ENV=development` |
| `yarn start:local` | Runs with `.env.development.local` (Developer A) |
| `yarn start:office` | Runs with `.env.office` (office environment) |
| `yarn start:prod` | Runs `nest start --watch` in production-like mode |
| `yarn build` | Standard `nest build` |

Use `env-cmd` or `dotenv-cli` only if NestJS `ConfigModule` alone cannot load the custom `.env.office` and `.env.development.local` files — if added, install as `devDependency`.

---

**Task 4 — README.md — Running Commands Reference**

Add a section titled `## Environment & Running Commands` that includes:

- A table of every `yarn` command, the env file it loads, and its purpose
- Setup instructions for Developer A and Developer B for their local `.env` files
- A warning that `yarn start` runs the **compiled production build** and requires `yarn build` first
- `.gitignore` reminder for which files must never be committed

---

**Task 5 — .gitignore Entries**

Confirm or add:

```
.env*.local
.env.production
.env.office
```

---

**Output:**

Return each file as a clearly labeled code block in this order:
1. `.env.development.local`
2. `.env.development`
3. `.env.office`
4. `.env.production`
5. `package.json` scripts section only
6. `README.md` environment section only
7. `.gitignore` additions only

No prose between code blocks. Inline `//* UPPERCASE COMMENTS` inside all files are required.