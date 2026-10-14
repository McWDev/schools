# Tenancy Implementation (decided in Task 001)

## Decisions
| Topic | Decision |
|---|---|
| ORM / query layer | Drizzle ORM 0.45 with the `pg` (node-postgres) driver. Schema in `src/server/db/schema.ts`, SQL migrations in `drizzle/`. |
| Isolation model | Shared tables with `school_id` on every tenant row, plus `branch_id` where branch-scoped. |
| Row-level security | **Enabled** as defense in depth on `schools`, `branches`, `school_memberships`, `membership_branches`, and `audit_events`. Application code still filters explicitly. RLS is the backstop if a query forgets. |
| Database roles | `neondb_owner` (or the CI superuser) runs migrations and seeds and bypasses RLS. The app connects as `app_runtime`: no table ownership, `NOBYPASSRLS`, explicit grants only, no `DELETE` on history tables. |
| Cross-school links | Composite foreign keys `(school_id, branch_id) → branches(school_id, id)` and `(school_id, membership_id) → school_memberships(school_id, id)`. The database rejects any row that mixes schools, even rows written by the owner role. |
| Audit log | `audit_events` is append-only. A trigger rejects `UPDATE`/`DELETE` for every role, and `app_runtime` is granted only `SELECT`/`INSERT`. |

## How tenant context flows
1. The server resolves `{ userId, schoolId }` with `resolveTenantContext()` in `src/server/tenancy/context.ts`. Access fails closed unless the user, the membership, and the school are all `active`. From Task 002, `userId` comes from the session, never from request input.
2. The result is a frozen `TenantContext` registered in a private `WeakSet`. `withTenant()` rejects any object it did not issue, so a context cannot be forged from request data or modified afterwards.
3. `withTenant(db, context, work)` opens a transaction and sets `app.school_id`, `app.user_id`, `app.scope`, and `app.branch_ids` with `set_config(..., is_local => true)`.
4. RLS policies read those values through `app.current_school_id()` and similar helper functions. When nothing is set, the helpers return NULL or empty and every policy matches zero rows.

## Connection pooling
- Transaction-local settings are discarded at `COMMIT` or `ROLLBACK`, so the next request on the same pooled connection starts with no context. This holds with Neon's PgBouncer pooler in transaction mode.
- Tests prove it: after commit and after rollback, a connection from a single-connection pool sees zero rows. Thirty concurrent, interleaved transactions for three different contexts each see only their own rows.
- Never use session-level `SET` (without `LOCAL`) for tenant values.

## Environment setup (per Neon branch)
```bash
# MIGRATION_DATABASE_URL = owner role, direct (non-pooled) endpoint
npm run db:migrate                    # apply migrations
npm run db:rotate-runtime-password    # prints the app_runtime pooled URL, which becomes DATABASE_URL
npm run db:seed                       # development only: synthetic School A / School B
```
- `development`: done 2026-10-14 and seeded.
- `test`: integration tests wipe it and re-apply all migrations on every run.
- `staging` and `production`: run `db:migrate` and `db:rotate-runtime-password` as a release step (Task 021). Never seed them.

## Known limitations / follow-ups
- `users` has no RLS yet. It is a global identity table that sign-in must read before any school is selected. Task 003 restricts which user fields a school can see through membership-scoped queries.
- Platform super-admin operations, such as creating schools, need a separate audited path (Tasks 005 and 019). The runtime role currently cannot insert into `schools`.
- Future tenant-owned tables must enable RLS and add policies in their migration. The checklist below applies.

## Checklist for every new tenant-owned table
- [ ] `school_id uuid not null` (and `branch_id` where relevant) with composite FKs to the parent.
- [ ] Unique constraints scoped by `school_id`, and an index that starts with `school_id`.
- [ ] `ENABLE ROW LEVEL SECURITY` plus policies for `app_runtime`.
- [ ] Minimal grants to `app_runtime`. No `DELETE` on history.
- [ ] Integration tests for cross-school and cross-branch reads, writes, and guessed IDs.
