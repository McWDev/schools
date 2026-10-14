# Evidence: Task 001, SaaS Tenancy Foundation and Database Isolation

Date: 2026-10-14 · Branch: `task/001-tenancy-foundation`

## What was built
- Drizzle schema and migrations: `drizzle/0000_init_tenancy.sql` (tables, composite FKs, scoped unique constraints, indexes) and `drizzle/0001_rls_and_runtime_role.sql` (`app_runtime` role, grants, RLS policies, fail-closed context functions, append-only audit trigger, `updated_at` triggers).
- Server tenancy layer: `src/server/tenancy/context.ts` (`resolveTenantContext`, `withTenant`, unforgeable contexts).
- First tenant-scoped service: `src/server/modules/branches/service.ts` (list, get, create, and update, with audit events).
- Scripts: `db:migrate`, `db:seed`, `db:rotate-runtime-password`, `check:bundle`.
- CI: a Postgres 18 service container runs migrations from scratch and the integration suite on every push and pull request.
- Design record: [11_TENANCY_IMPLEMENTATION.md](../11_TENANCY_IMPLEMENTATION.md).

## Acceptance criteria
- [x] **Migrations work on a clean database.** Each integration run drops all schemas on the Neon `test` branch and applies every migration. CI does the same on an empty Postgres 18.
- [x] **School A cannot read or mutate School B's records.** Tests cover list, get by guessed ID, update by ID, raw inserts and updates under RLS, and an unfiltered query.
- [x] **A branch cannot be associated with another school's ID.** Composite FKs reject it for both the owner and runtime roles, including on `audit_events`.
- [x] **Missing tenant context fails closed.** The runtime role sees 0 rows in every tenant table without context. `withTenant` rejects undefined and forged contexts.
- [x] **The browser cannot access the connection string.** `server-only` guards every DB module, and `check:bundle` scanned 22 client files: clean.
- [x] **Tenant-isolation regression tests run automatically.** They are part of `npm run test` and CI.

## Required adversarial tests
| Test | Result |
|---|---|
| Forge `school_id` / `schoolId` in the request payload | Rejected by strict schema; no row written |
| Guess another school's row ID | `getBranch` returns `null`; `updateBranch` returns `null` and the row is unchanged |
| Submit a branch ID from another school | FK violation (`membership_branches_branch_fk`, `audit_events_branch_fk`) |
| Call a data helper without tenant context | `TenantAccessError`; raw runtime queries return 0 rows |
| RLS with connection pooling | Context cleared after commit and rollback; 30 interleaved concurrent transactions never leak |

Also verified: the runtime role is not a superuser, has no BYPASSRLS, and owns no tables. Suspended membership, suspended school, and deactivated user are each denied. Malformed IDs are rejected. A multi-school user gets separate contexts. Removing a branch assignment removes access. Branch users can't see sibling branches or create branches. Audit events are written in the same transaction, scoped per school, and append-only even for the owner.

## Test run
```
npm run test:integration   →  Test Files 1 passed (1) · Tests 26 passed (26)   (Neon test branch, us-east-2)
npm run test:unit          →  Tests 4 passed (4)
npm run lint / typecheck   →  clean
npm run build              →  success
npm run check:bundle       →  Client bundle clean (22 files checked)
```
Development branch: migrated and seeded. Verified that `app_runtime` connects through the Neon pooler, sees 0 branches without context, and sees exactly A-MAIN and A-NORTH with School A context.

## Known limitations
- Local integration runs take about 1–3 minutes because each query is a round trip to us-east-2. CI uses a local Postgres container and is much faster.
- `users` has no RLS yet (global identity); see the follow-ups in the design record.
- The Neon MCP connector signed out during this task. Branch management through Claude needs re-authorization, but the app and scripts are unaffected.
