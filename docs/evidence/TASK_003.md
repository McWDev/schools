# Evidence: Task 003, User Management, Roles, Permissions, and Profile Photos

Date: 2026-10-14 · Branch: `task/003-user-management`

## What was built
- **Migrations:**
  - `0004_rbac_invitations.sql` adds `permissions`, school-scoped `roles`, `role_permissions`, `membership_roles`, and `user_invitations`, plus `users.avatar_key` and `sessions.reauthenticated_at`.
  - `0005_rbac_policies.sql` adds the permission catalog and the system role templates (installed per school by trigger). It also adds RLS on every new tenant table, `app.consume_invitation()` (single-use token, works without tenant context), and `app.count_other_memberships()`, a count-only check limited to the current school.
- **Permissions in context:** `TenantContext.permissions` is resolved server-side, with `requirePermission()` and `hasPermission()` helpers. The branch service now checks `branches.read` and `branches.manage`.
- **User management** (`src/server/modules/users/`): list with search and pagination, detail, invite, resend, roles, branch access, deactivate and restore, and display-name edits. Scope visibility, escalation, and self-protection rules are enforced in `access-rules.ts`.
- **Invitation acceptance** (`/accept-invitation`), using a token carried in the URL fragment.
- **Re-authentication:** role, access, and status changes require a password entered within the last 10 minutes.
- **Profile** (`/dashboard/profile`): name, photo upload and removal, and password change, which signs out other devices.
- **Profile photos:** `sharp` decodes the real bytes, limits are enforced, each photo is re-encoded to a 512×512 WebP with metadata stripped, and files go to private storage under generated keys. They are served only by the authorized `/api/avatars/[userId]` route.
- **Interim navigation** for signed-in pages. The full shell comes in Task 004.
- **Design record:** [13_USERS_AND_PERMISSIONS.md](../13_USERS_AND_PERMISSIONS.md).

## Acceptance criteria
- [x] **Permission checks are server-side for every action.** Every service calls `requirePermission`, the UI only hides links, and direct URLs and actions are re-checked.
- [x] **Users cannot grant themselves roles or permissions.** Self-changes are rejected. Roles must be a subset of the actor's permissions. Payloads carrying `permissions` or `isPlatformAdmin` are rejected.
- [x] **A school admin cannot manage another school's users.** Cross-school membership IDs return not found for get, roles, access, status, and profile, and the data is verified unchanged.
- [x] **Branch admins stay inside their scope.** They cannot see school admins, people who also work at other branches, or other branches. Granting school scope or foreign branches is rejected.
- [x] **Photo uploads enforce real format, size, and dimensions.** Disguised HTML, SVG, and PDF files, a PNG header followed by junk, GIF, empty and over-2 MB files, too-small and too-large images are all rejected. EXIF is stripped.
- [x] **Deactivated users lose access as documented.** A user whose only school removes them is deactivated with all sessions revoked. Multi-school users lose only that school, on their next request.
- [x] **Changes create audit events.** Covered: `user.invite`, `user.invite.resend`, `user.roles.update` (before and after), `user.access.update`, `user.deactivate` and `user.reactivate`, `user.profile.update`, `user.invite.accept`, and the `profile.*` events.

## Required tests
| Case | Where |
|---|---|
| Forged role payloads | `users.test.ts`: another school's role ID; escalated roles; extra `permissions`, `schoolId`, and `isPlatformAdmin` fields; forged context |
| Cross-school user IDs | `users.test.ts`: get, roles, access, status, and profile all return not found; e2e: school B cannot fetch a school A photo |
| Cross-branch edits | `users.test.ts`: branch admin vs a multi-branch teacher and vs a school admin; e2e: direct URL renders not found |
| Invalid photo types | `avatar-image.test.ts` (6 tests); e2e: disguised `.png` rejected |
| Oversized files | `avatar-image.test.ts`: over 2 MB and over 6000 px |
| Invitation replay | `users.test.ts` and e2e: the second use of a link fails |
| Deactivated sessions | `users.test.ts`: session revoked; multi-school user keeps other schools |

## Test run
```
npm run test:unit          →  21 passed (incl. 6 photo-validation, 4 storage-key tests)
npm run test:integration   →  84 passed: tenancy 26 · auth 27 · users 31   (Neon test branch)
npm run test:e2e           →  15 passed (Chromium, production build)
npm run lint / typecheck / format:check  →  clean
npm run build              →  success, no warnings
npm run check:bundle       →  Client bundle clean (31 files checked)
```
Development branch: migrations 0004–0005 applied; synthetic users have their roles, plus a new branch admin (`branch.admin.a1@example.test`).

## Screenshots
- Users list (school admin): `img/task003-users.png`
- Member detail with roles, branch access, and remove access: `img/task003-member.png`
- Invite form: `img/task003-invite.png`

## Performance fix found during testing
Tenant context resolution now uses one query instead of three, and a single-school user's school is remembered on the session. Each request needs fewer round trips; this was measurable with the remote database.

## Known limitations
- **Production storage.** Photos need a private cloud bucket driver before production (`STORAGE_DRIVER` is disabled in production by default; Task 021).
- **Custom roles.** Custom role editing is not built; the six system roles are fixed for now.
- **Status code for out-of-scope records.** With partial prerendering, an out-of-scope member page answers HTTP 200 and then streams the not-found page. No data is rendered; the e2e test checks that the content is absent.
- **Local test speed.** Local runs are slow, about 12 minutes for integration and e2e combined, because of the round trip to Neon. CI uses a local Postgres.
