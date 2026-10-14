# Technical Architecture

## 1. Stack (confirmed)
- **Runtime:** Node.js 24 LTS.
- **Web application:** Next.js 16 App Router + TypeScript (strict).
- **Database:** Neon serverless PostgreSQL, one database per school installation.
- **Database access:** Drizzle ORM with the `pg` driver (Task 001).
- **Validation:** Zod schemas on the server.
- **Authentication:** in-house sessions on maintained cryptography (argon2id, hashed tokens) (Task 002).
- **UI:** Tailwind CSS 4 with design tokens and accessible, responsive components.
- **Testing:** Vitest (unit, integration) and Playwright (end-to-end, accessibility with axe).
- **File storage:** private object storage for profile photos and documents. Neon is not a file store.
- **Monitoring:** structured server logs and error/availability monitoring (Task 021).

## 2. High-level layers
1. **Presentation:** pages, components, forms, loading/error/empty states.
2. **Server entry points:** route handlers and server actions with validation and authorization.
3. **Application services** (`src/server/modules/*`): business rules and workflows.
4. **Access layer** (`src/server/access`): resolves the user's scope, branches, and permissions, and runs work inside an access-scoped transaction.
5. **PostgreSQL:** constraints, indexes, migrations, and row-level security as defense in depth.
6. **External services:** email, private file storage, monitoring, and an optional payment provider.

## 3. Repository conventions
See [10_REPOSITORY_CONVENTIONS.md](10_REPOSITORY_CONVENTIONS.md).

## 4. Domain organization
`auth`, `access`, `branches`, `users` (staff and roles), `profile`, `dashboard`, `audit`, then later `students`, `academics`, `attendance`, `exams`, `fees`, `guardians`, `communications`, `reports`, `settings`.

## 5. Data access rules
- The client never connects directly to Neon.
- Each data operation receives a validated server-side `AccessContext`, and helpers refuse forged or missing contexts.
- Branch-scoped entities are always filtered by the user's branches. RLS backs this up.
- Use transactions for multi-step operations that must succeed or fail together.
- Never pass raw database rows to the client when they contain fields the user should not see.
- Use pagination and stable ordering for list pages.
- Background jobs carry a validated user or system context rather than relying on a browser session.

## 6. Environments
- **Local development:** the Neon `development` branch with synthetic data.
- **Tests:** the Neon `test` branch locally (wiped each run); a Postgres container in CI.
- **Staging:** synthetic or masked data.
- **Production:** real records, one database per school installation.
- Never copy real student data into local or staging environments unless there is a reviewed, lawful, masked-data procedure.
