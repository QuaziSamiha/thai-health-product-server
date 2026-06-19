## Environment & Running Commands

### Command Reference

| Command             | Env File Loaded                | Purpose                                                                    |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `yarn start`        | _(none — reads compiled dist)_ | **Production start** — runs `node dist/main`. Requires `yarn build` first. |
| `yarn start:dev`    | `.env.development`             | Developer B shared config — standard watch-mode dev server                 |
| `yarn start:local`  | `.env.development.local`       | Developer A personal local config — watch-mode dev server                  |
| `yarn start:office` | `.env.office`                  | Office/internal environment — points to `192.168.0.221` DB                 |
| `yarn start:prod`   | `.env.production`              | Production config loaded locally — watch-mode, for staging verification    |
| `yarn build`        | _(none)_                       | Compiles TypeScript source to `dist/`                                      |

> **Warning:** `yarn start` runs the **compiled production build** (`node dist/main`).
> It does **not** compile the source. Always run `yarn build` before `yarn start`, otherwise you will execute stale or missing output.


### Running the app itself against a specific env

```bash
yarn start:dev      # .env.development
yarn start:local     # .env.development.local (your personal DB)
yarn start:office    # .env.office
yarn start:prod      # .env.production
```

- [Project Setup](./documentations/PROJECT_SETUP.md)
- [Category Module](./documentations/CATEGORY.md)
- [Product Module](./documentations/PRODUCT.md)
