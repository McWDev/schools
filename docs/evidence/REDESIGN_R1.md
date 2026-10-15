# Evidence: Redesign R1, Single-School Model (SaaS Removed)

Date: 2026-10-14 · Branch: `redesign/single-school` · Requested by the owner after Task 004.

## Decision
The system is a School Management System for **one school with many branches** in different areas, not a multi-school SaaS. Each installation serves one school with its own database. The owner confirmed:
- one school per installation
- a refactor on a new branch, keeping git and migration history

## What changed
| Area | Before (SaaS) | After |
|---|---|---|
| School | `schools` tenant table, `school_id` on rows, lifecycle (pending/active/suspended/closed) | `school_settings`: a single profile row (`id = 1`, enforced by a CHECK) |
| Access | `school_memberships` (scope, status), `membership_branches`, `membership_roles` | `users.access_scope`, `user_branches`, `user_roles` |
| Roles | per school, installed by a trigger on new schools | one global set of system roles (`app.install_system_roles()`) |
| Branches | unique code per school, composite FKs | unique code; new **`area`** field |
| RLS | tenant (`app.in_school`) | signed-in user (`app.has_user()`) plus branch scope (`app.branch_visible()`); fails closed |
| Context | `TenantContext` / `withTenant` / `resolveTenantContext` | `AccessContext` / `withAccess` / `resolveAccessContext` (`src/server/access/`) |
| Platform | platform admin flag, overview page, `app.platform_school_counts()` | removed |
| Shell | school switcher, school picker | removed; the school name comes from the profile, and the branch selector stays |
| Users | membership suspension, cross-school name rules | deactivation revokes all sessions; any manageable person can be renamed |
| First admin | `auth:bootstrap-admin` (platform admin) | `npm run setup` (school name plus first school administrator) |
| Docs and tasks | SaaS PRD, tenancy model, Task 005 onboarding and plans, Task 019 billing | single-school PRD, `02_ACCESS_MODEL.md`, Task 005 school profile and settings, Task 019 system administration and MFA |

Authentication is unchanged: it is still the system's own implementation (argon2id, hashed session and reset tokens, rate limits).

## Migration `0008_single_school.sql`
- **Guard:** refuses to run when more than one school exists, because merging separate schools cannot be done safely automatically.
- **Conversion:**
  - the single school becomes the school profile
  - membership scope, roles, and branches move onto users
  - suspended memberships become deactivated accounts
  - roles are merged into one global set
- **Verified on a disposable database** (Neon `test` branch) by applying migrations 0000–0007 with the old two-school data:
  - with two schools it refused: `Single-school conversion found 2 schools…`
  - with one school it converted correctly: the profile, scopes (`school`/`branch`), roles, branch assignments, and one deactivated account all came through, 6 roles remained, no old tables were left, and the new policy set was in place
- The verification also caught one ordering bug (an old `schools` policy depended on `school_memberships`), fixed before commit.
- **Drizzle snapshot** regenerated so `drizzle-kit generate` reports "No schema changes".
- **Development database:** it held only synthetic data (2 example schools, 6 `@example.test` accounts, checked before clearing). It was cleared, migrated, and re-seeded with Example Academy. Production was untouched and is still empty.

## Test run
```
npm run test:unit          →  26 passed
npm run test:integration   →  91 passed: access 33 · auth 27 · staff 24 · dashboard 7   (Neon test branch)
npm run test:e2e           →  30 tests; all pass in CI (local run was interrupted by a network outage)
npm run lint / typecheck / format   →  clean
npm run build              →  success
npm run check:bundle       →  Client bundle clean (33 files checked)
```
CI passed: https://github.com/McWDev/schools/actions/runs/38675122288. `main` was fast-forwarded to `717d38a`.

## Design refresh (requested together with R1)
- Light, Dark, and System themes with no flash before first paint. Dark mode has axe AA checks, and the contrast tokens were raised after axe flagged them.
- Navy sidebar, gradient welcome banner, icon stat cards, and shared button and input styles.
- Screenshots: `img/r1-login-light.png`, `img/r1-login-dark.png`, `img/r1-dashboard-light.png`, `img/r1-dashboard-dark.png`, `img/r1-users-light.png`, `img/r1-dashboard-mobile.png`.
