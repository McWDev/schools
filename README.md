# School Management System

A school management system for **one school with many branches** in different areas. Built with Next.js 16 (App Router) and TypeScript on Node.js 24, with Neon PostgreSQL.

Each installation serves one school with its own database. The product, security, and task specifications live in [`docs/`](docs/README.md). Work proceeds one task at a time from [`docs/TASKS/`](docs/TASKS); progress is tracked in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Getting started (development)

```bash
nvm use                      # Node 24 (see .nvmrc)
npm ci
cp .env.example .env.local   # fill in the Neon "development" branch connection strings
npm run db:migrate           # apply database migrations
npm run db:seed              # synthetic "Example Academy" (development only)
npm run dev                  # http://localhost:3217
```

Development sign-in uses the synthetic accounts below. All of them use the development-only password `password1234` (see `scripts/lib/synthetic-school.ts`). Emails such as password resets and invitations are written to `.outbox/` instead of being sent.

| Account                      | Access                             |
| ---------------------------- | ---------------------------------- |
| `admin@example.test`         | School administrator, all branches |
| `main.admin@example.test`    | Branch administrator, Main Campus  |
| `main.teacher@example.test`  | Teacher, Main Campus               |
| `north.teacher@example.test` | Teacher, North Campus              |

## Setting up a real school

```bash
npm run db:migrate
npm run db:rotate-runtime-password   # store the printed URL as DATABASE_URL
npm run setup -- --school "Your School" --email head@yourschool.org --name "Head Teacher" --timezone Africa/Mogadishu
```

`setup` names the school and creates the first school administrator. It prints a one-time link to set their password (no default password exists). Everyone else is invited from **Users**.

## Scripts

| Command                                   | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                             | Start the local dev server (Turbopack) on port 3217               |
| `npm run build` / `npm run start`         | Production build and server                                       |
| `npm run lint`                            | ESLint, zero warnings allowed                                     |
| `npm run format` / `npm run format:check` | Prettier                                                          |
| `npm run typecheck`                       | Generate route types and run `tsc --noEmit` (strict)              |
| `npm run test:unit`                       | Unit tests (Vitest)                                               |
| `npm run test:integration`                | Access-control, auth, and staff tests against `TEST_DATABASE_URL` |
| `npm run test:e2e`                        | Browser tests (Playwright); run `npm run build` first             |
| `npm run check`                           | Everything CI runs except e2e                                     |
| `npm run db:generate`                     | Generate a migration from `src/server/db/schema.ts`               |
| `npm run db:migrate`                      | Apply migrations (`MIGRATION_DATABASE_URL`, owner role)           |
| `npm run db:rotate-runtime-password`      | Set the `app_runtime` password; prints `DATABASE_URL`             |
| `npm run db:seed`                         | Insert the synthetic school (development only)                    |
| `npm run setup`                           | First-run setup: school name and first administrator              |

## Environments and database

Neon project **`schools`** (`wandering-union-14776988`, AWS us-east-2, Postgres 18):

| Neon branch   | Use                                           |
| ------------- | --------------------------------------------- |
| `development` | Local development, synthetic data             |
| `test`        | Disposable; integration and e2e tests wipe it |
| `staging`     | To be created before first deployment         |
| `production`  | Real school data only, never local            |

Connection strings are server-only. They are stored in `.env.local` / `.env.test.local` (gitignored) or the hosting provider's secret manager, and are never prefixed with `NEXT_PUBLIC_`.

Design records: [access model](docs/02_ACCESS_MODEL.md), [access control implementation](docs/11_ACCESS_CONTROL_IMPLEMENTATION.md), [authentication](docs/12_AUTHENTICATION.md), [staff and permissions](docs/13_USERS_AND_PERMISSIONS.md).

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and `task/**` / `redesign/**` branches and on every pull request:

- install, lint, format check, typecheck
- unit tests
- integration tests (Postgres 18 service, migrations from scratch)
- build and client-bundle secret scan
- Playwright end-to-end tests
- production dependency audit

A change merges only when CI is green. See [`docs/10_REPOSITORY_CONVENTIONS.md`](docs/10_REPOSITORY_CONVENTIONS.md) for folder layout and workflow rules.
