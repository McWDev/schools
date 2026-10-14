# Access Control Implementation

## Decisions
| Topic | Decision |
|---|---|
| ORM / query layer | Drizzle ORM 0.45 with the `pg` driver. Schema in `src/server/db/schema.ts`, SQL migrations in `drizzle/`. |
| Model | One school per installation; branch scope is the access boundary (see [02_ACCESS_MODEL.md](02_ACCESS_MODEL.md)). |
| Row-level security | **Enabled** as defense in depth on `branches`, `roles`, `role_permissions`, `user_roles`, `user_branches`, `audit_events`, `user_invitations`, and `school_settings`. Application code still filters explicitly. |
| Database roles | `neondb_owner` (or the CI superuser) runs migrations and setup and bypasses RLS. The app connects as `app_runtime`: no table ownership, `NOBYPASSRLS`, explicit grants only, and no `DELETE` on history tables. |
| Audit log | `audit_events` is append-only. A trigger rejects `UPDATE`/`DELETE` for every role, and `app_runtime` only has `SELECT`/`INSERT`. |

## How access flows
1. Every request validates the session cookie against `sessions` (`src/server/auth/sessions.ts`).
2. `resolveAccessContext(db, userId)` (`src/server/access/context.ts`) loads the user's status, scope, branches, and permissions in one query. It fails closed unless the account is `active`.
3. The result is a frozen `AccessContext` registered in a private `WeakSet`. `withAccess()` rejects any object it did not issue, so access cannot be forged from request data or modified afterwards.
4. `withAccess(db, context, work)` opens a transaction and sets `app.user_id`, `app.scope`, and `app.branch_ids` with `set_config(..., is_local => true)`.
5. RLS policies read those values through `app.has_user()`, `app.current_scope()`, and `app.branch_visible(id)`. With no user set, every protected table returns zero rows. The school name stays readable for the sign-in page.

## Policies at a glance
| Table | Read | Write |
|---|---|---|
| `school_settings` | anyone (public name) | signed-in user (app checks `school.settings.manage`) |
| `branches` | signed-in and `branch_visible(id)` | insert: school-wide scope only; update: `branch_visible(id)` |
| `user_branches` | signed-in | insert/delete only for branches inside the actor's scope |
| `roles`, `role_permissions` | signed-in | migrations only |
| `user_roles`, `user_invitations` | signed-in | signed-in (app enforces escalation rules) |
| `audit_events` | signed-in, branch rows only if visible | insert always (failed sign-ins have no user) |

## Connection pooling
- Transaction-local settings are discarded at `COMMIT` or `ROLLBACK`, so the next request on the same pooled connection starts with no context. This holds with Neon's PgBouncer pooler in transaction mode.
- Tests prove it: after commit and after rollback, a connection from a single-connection pool sees zero rows. Thirty interleaved concurrent transactions for three users each see only their own branches.
- Never use session-level `SET` (without `LOCAL`) for access values.

## Environment setup (per database)
```bash
# MIGRATION_DATABASE_URL = owner role, direct (non-pooled) endpoint
npm run db:migrate                    # apply migrations
npm run db:rotate-runtime-password    # prints the app_runtime pooled URL → DATABASE_URL
npm run setup -- --school "Name" --email admin@example.com --name "Head Teacher"   # real installs
npm run db:seed                       # development only: synthetic Example Academy
```

## Checklist for every new branch-scoped table
- [ ] `branch_id uuid not null references branches(id)`, plus an index on `branch_id`.
- [ ] Unique constraints that state their scope.
- [ ] `ENABLE ROW LEVEL SECURITY`, with policies using `app.has_user()` and `app.branch_visible(branch_id)`.
- [ ] Minimal grants to `app_runtime`. No `DELETE` on history.
- [ ] Integration tests for cross-branch reads, writes, guessed IDs, and forged payloads.
