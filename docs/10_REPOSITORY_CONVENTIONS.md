# Repository Conventions (decided in Task 000)

## Toolchain
- Node.js 24 LTS (`.nvmrc`), npm 11 with a committed `package-lock.json` (`npm ci` in CI).
- Next.js 16 App Router, React 19, TypeScript strict mode, Tailwind CSS 4.
- ESLint (`eslint-config-next` + `eslint-config-prettier`), zero warnings allowed.
- Prettier with the Tailwind class-sorting plugin.
- Vitest for unit and integration tests. Playwright will be added with the first end-to-end workflow (Task 002).
- Zod for server-side validation, including environment variables (`src/lib/env-schema.ts`).

## Planned choices (confirmed in their tasks)
- Database access: **Drizzle ORM** with the `pg` driver (confirmed in Task 001; see `11_TENANCY_IMPLEMENTATION.md`). Migrations via `drizzle-kit`, committed under `drizzle/`.
- Authentication: selected and documented in Task 002.

## Source layout
```
src/
  app/                 Routes, layouts, route handlers, server actions (thin)
  components/          Shared UI components and design tokens
  lib/                 Cross-cutting utilities (env, logging, errors)
  server/
    db/                Drizzle client, schema, tenant-scoped query helpers
    auth/              Session and identity
    modules/<domain>/  Business services per domain (tenants, branches, students, ...)
tests/                 Integration, security regression, and e2e suites
drizzle/               Generated SQL migrations (reviewed, committed)
docs/                  Product and engineering documentation (Markdown only)
```

Rules:
- Every file under `src/server/`, plus `src/lib/env.ts`, imports `server-only`, so it cannot be bundled for the browser. Exception: `src/server/db/schema.ts` (table definitions only, loaded directly by drizzle-kit).
- `scripts/` holds owner-level tooling (migrations, seeding, role setup). Application code never imports it.
- Domain logic lives in `src/server/modules`, not in UI components or route files.
- Unit tests sit next to the file they test (`*.test.ts`); cross-module and database tests go in `tests/`.

## Workflow (continuous integration / continuous development)
1. One task per branch: `task/NNN-short-name`, opened as a pull request into `main`.
2. Commit small, working increments; each commit should pass `npm run check`.
3. CI must be green before merging. Do not skip or weaken tests to get a green result.
4. Record evidence for each task in `docs/evidence/TASK_NNN.md` and update `docs/PROGRESS.md`.
5. The task gate in `07_TEST_AND_RELEASE_GATES.md` applies: the owner reviews each task before the next one starts.
6. Schema changes go through migrations only. They are applied to the Neon `development` branch first, then `staging`, then `production` as a controlled release step.
