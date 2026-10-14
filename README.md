# School Management SaaS

Multi-tenant school management platform. Next.js 16 (App Router) + TypeScript on Node.js 24, Neon PostgreSQL.

The product, security, and task specifications live in [`docs/`](docs/README.md). Work proceeds one task at a time from [`docs/TASKS/`](docs/TASKS); progress is tracked in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Getting started

```bash
nvm use            # Node 24 (see .nvmrc)
npm ci
cp .env.example .env.local   # then fill in the Neon "development" branch connection string
npm run dev        # http://localhost:3217
```

## Scripts

| Command                | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | Start the local dev server (Turbopack)                   |
| `npm run build`        | Production build                                         |
| `npm run start`        | Serve the production build                               |
| `npm run lint`         | ESLint, zero warnings allowed                            |
| `npm run format`       | Format with Prettier                                     |
| `npm run format:check` | Verify formatting (CI)                                   |
| `npm run typecheck`    | Generate route types and run `tsc --noEmit` (strict)     |
| `npm run test`         | Unit/integration tests (Vitest)                          |
| `npm run check`        | Everything CI runs: lint, format, typecheck, test, build |

## Environments and database

Neon project **`schools`** (`wandering-union-14776988`, AWS us-east-2, Postgres 18):

| Neon branch   | Use                                   |
| ------------- | ------------------------------------- |
| `development` | Local development, synthetic data     |
| `staging`     | To be created before first deployment |
| `production`  | Real school data only, never local    |
| `test`        | Disposable; integration tests wipe it |

Connection strings are server-only and stored in `.env.local` / `.env.test.local` (gitignored) or the hosting provider's secret manager. Never prefix them with `NEXT_PUBLIC_`.

| Command                              | Purpose                                                 |
| ------------------------------------ | ------------------------------------------------------- |
| `npm run db:generate`                | Generate a migration from `src/server/db/schema.ts`     |
| `npm run db:migrate`                 | Apply migrations (`MIGRATION_DATABASE_URL`, owner role) |
| `npm run db:rotate-runtime-password` | Set the `app_runtime` password; prints `DATABASE_URL`   |
| `npm run db:seed`                    | Insert synthetic School A / School B (development only) |
| `npm run test:integration`           | Tenant-isolation tests against `TEST_DATABASE_URL`      |

Tenant isolation design: [`docs/11_TENANCY_IMPLEMENTATION.md`](docs/11_TENANCY_IMPLEMENTATION.md).

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and `task/**` branches and on every pull request: install, lint, format check, typecheck, unit tests, integration tests (Postgres 18 service, migrations from scratch), build, client-bundle secret scan, and production dependency audit. A change merges only when CI is green.

See [`docs/10_REPOSITORY_CONVENTIONS.md`](docs/10_REPOSITORY_CONVENTIONS.md) for folder layout and workflow rules.
