# Essence Lab Server

A NestJS-based backend architecture featuring Prisma ORM, PostgreSQL, and comprehensive security modules including authentication and rate limiting.

## 🚀 Getting Started

### 1. Project Initialization

Start by creating the project and installing the core dependencies.

```bash
# Create the project
nest new essence-lab-server

# Install core dependencies
yarn install
```

### 2. Database & Prisma Setup

This project uses **Prisma ORM** with **PostgreSQL**.

```bash
# Add Prisma CLI and Client
yarn add -D prisma
yarn add @prisma/client @prisma/adapter-pg pg
yarn add -D @types/pg

# Initialize Prisma
npx prisma init

# Generate NestJS Prisma module and service
nest generate module prisma
nest generate service prisma
```

#### Database Configuration

Update your `.env` file with your connection string:

```env
DATABASE_URL="postgresql://root:password@localhost:5432/nestjs-codebase"
```

#### Migration & Studio

```bash
# Run migrations
npx prisma migrate dev --name init_schema

# Generate Prisma Client (Run after every schema change)
npx prisma generate

# Open Prisma Studio to view data
npx prisma studio
```

---

## 🛠 Feature Modules Installation

### Security & Optimization

```bash
# Throttler (Rate Limiting) & Static Files
yarn add @nestjs/throttler @nestjs/serve-static

# Configuration Management
yarn add @nestjs/config

# Validation
yarn add class-validator class-transformer

# Authentication (JWT & Bcrypt)
yarn add jsonwebtoken bcrypt
yarn add -D @types/jsonwebtoken @types/bcrypt
```

### Documentation (Swagger)

```bash
yarn add @nestjs/swagger swagger-ui-express
```

---

## 📂 Module Scaffolding

Use these commands to generate consistent module structures.

### User Module Example

```bash
# Generate basic components
nest generate module modules/user
nest generate controller modules/user --no-spec
nest generate service modules/user --no-spec

# Manual file creation for Repository and DTOs
touch src/modules/user/user.repository.ts
mkdir src/modules/user/dto
touch src/modules/user/dto/create-user-multipart.dto.ts
touch src/modules/user/dto/user-response.dto.ts
```

## Environment & Running Commands

### Command Reference

| Command | Env File Loaded | Purpose |
|---|---|---|
| `yarn start` | _(none — reads compiled dist)_ | **Production start** — runs `node dist/main`. Requires `yarn build` first. |
| `yarn start:dev` | `.env.development` | Developer B shared config — standard watch-mode dev server |
| `yarn start:local` | `.env.development.local` | Developer A personal local config — watch-mode dev server |
| `yarn start:office` | `.env.office` | Office/internal environment — points to `192.168.0.221` DB |
| `yarn start:prod` | `.env.production` | Production config loaded locally — watch-mode, for staging verification |
| `yarn build` | _(none)_ | Compiles TypeScript source to `dist/` |

> **Warning:** `yarn start` runs the **compiled production build** (`node dist/main`).
> It does **not** compile the source. Always run `yarn build` before `yarn start`, otherwise you will execute stale or missing output.

---

- [Category Module](./documentations/CATEGORY.md)
- [Product Module](./documentations/PRODUCT.md)
