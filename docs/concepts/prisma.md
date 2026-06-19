## 3. Env file precedence

Both loading paths resolve files in this order (first file to define a variable wins; later files only fill in what's missing):

```
1. .env.<NODE_ENV>.local   (e.g. .env.development.local — personal, gitignored, never shared)
2. .env.<NODE_ENV>         (e.g. .env.development — shared team defaults)
3. .env                    (fallback / generic)
```

`NODE_ENV` defaults to `development` if unset. This means running any bare `npx prisma ...` command now correctly picks up `.env.development.local` without needing the `dotenv-cli` wrapper.

---