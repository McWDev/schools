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

Connection strings are server-only and stored in `.env.local` (gitignored) or the hosting provider's secret manager. Never prefix them with `NEXT_PUBLIC_`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: install, lint, format check, typecheck, tests, build, production dependency audit. A change merges only when CI is green.

See [`docs/10_REPOSITORY_CONVENTIONS.md`](docs/10_REPOSITORY_CONVENTIONS.md) for folder layout and workflow rules.
