# Technical Architecture

## 1. Proposed stack
- **Runtime:** Node.js LTS supported by the selected Next.js release.
- **Web application:** Next.js App Router + TypeScript.
- **Database:** Neon serverless PostgreSQL.
- **Database access:** choose one typed ORM/query layer (for example, Drizzle ORM or Prisma) after a short compatibility review; do not mix multiple ORMs without a strong reason.
- **Validation:** schema-based server validation.
- **Authentication:** maintained Next.js-compatible auth solution, selected and documented in Task 002.
- **UI:** accessible component system, design tokens, responsive layouts.
- **Testing:** unit, integration, end-to-end, and security regression tests.
- **File storage:** private object storage for profile photos and documents; do not assume Neon is a file store.
- **Monitoring:** structured server logs and error/availability monitoring.

## 2. High-level layers
1. Presentation: pages, components, forms, loading/error/empty states.
2. Server entry points: route handlers and server actions with validation and authorization.
3. Application services: business rules and workflows.
4. Data access: tenant-scoped queries, transactions, repositories where useful.
5. PostgreSQL: constraints, indexes, migrations, optional RLS defense in depth.
6. External services: email, private file storage, monitoring, optional payment provider.

## 3. Repository conventions
- Keep domain logic out of large UI components.
- Use strict TypeScript and explicit return types for shared service boundaries.
- Use consistent naming and folder conventions.
- Use migrations for all schema changes.
- Add tests beside or grouped with the relevant feature.
- Keep secrets and deployment settings out of source control.
- Keep documentation in Markdown as requested; code/config/test files must use the file formats required by their tools.

## 4. Example domain organization
- `auth`
- `tenants`
- `branches`
- `users-and-permissions`
- `students`
- `staff`
- `academics`
- `attendance`
- `exams-and-grading`
- `fees-and-payments`
- `guardians`
- `communications`
- `reports`
- `audit`
- `platform-admin`

Exact source folders are to be finalized in Task 000, before implementation.

## 5. Data access rules
- The client must never connect directly to Neon.
- Each data operation must receive a validated server-side actor/context.
- Shared query helpers should require tenant scope for tenant-owned entities.
- Transactions should be used for multi-step operations that must succeed or fail together.
- Avoid passing raw database rows to the client if they contain fields the user should not see.
- Use pagination and stable ordering for list pages.
- Background jobs must carry a validated tenant context rather than relying on a browser session.

## 6. Environments
- Local development database.
- Staging database with synthetic/test data.
- Production database with real records.
- Never copy real student data into local or staging environments unless there is a reviewed, lawful, masked-data procedure.
