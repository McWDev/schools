# Evidence: Task 004, Professional Dashboard Shell and Navigation

Date: 2026-10-14 · Branch: `task/004-dashboard-shell`

## What was built
- **Application shell** (`src/app/dashboard/layout.tsx`, `app-shell.tsx`):
  - grouped sidebar with icons and `aria-current` on the active page
  - top bar with school and branch selectors and an account menu (photo, name, profile, sign out)
  - an accessible mobile drawer: focus moves into it, and Escape or navigating closes it
  - a "Skip to content" link
- **Role-aware navigation** (`navigation.ts`): a pure function of permissions, the selected school, and the platform-admin flag, with unit tests. Hiding links is a convenience only; every page and action still checks on the server.
- **Branch context:**
  - The selection is stored on the server-side session (`sessions.active_branch_id`, migration `0006`).
  - It is re-validated against the user scope on every request.
  - A composite FK (`0007`) guarantees the branch belongs to the session's school; switching school clears it.
- **Dashboard** (`src/server/modules/dashboard/service.ts`). Every figure comes from a scoped server-side query and appears only with the matching permission:
  - active branches
  - staff with access, pending invitations, and staff without access
  - your roles and access
  - recent school activity (`audit.read`)
  - quick actions, plus a "Get started" state for a new school and an honest empty state for teachers
  - nothing fabricated
- **Platform overview** for platform administrators: aggregate school counts through `app.platform_school_counts()`, which verifies the user row in the database and never returns school records.
- **States:** dashboard `loading.tsx`, `error.tsx` (generic message with a reference digest and retry), `not-found.tsx`, and skeletons inside Suspense boundaries.
- **Test data:** a synthetic platform administrator (`platform@example.test`) for development and tests.

## Acceptance criteria
- [x] **Each role sees appropriate navigation.** Platform admin, school admin, branch admin, and teacher are covered by unit tests and e2e checks per role.
- [x] **School admin can switch branches within their school.** Tested in e2e (All branches → A North Campus → back) and in integration.
- [x] **Branch users cannot select or query an unassigned branch.** The menu offers only assigned branches (e2e). `resolveBranchFilter` refuses unassigned branches, other schools' branches, and malformed IDs. `getDashboardSummary` throws `ForbiddenError` for out-of-scope branches. The DB rejects a session branch from another school.
- [x] **Dashboard metrics use scoped server-side queries, with no fabricated data.** Covered by integration tests for the school admin, a selected branch, the branch admin, and the teacher, and by activity isolation between schools.
- [x] **Core screens work on mobile, tablet, and desktop.** The e2e checks run at 390 px, 820 px, and 1440 px with no horizontal overflow; the drawer is tested at mobile width.
- [x] **Keyboard focus and labels are usable, with no critical accessibility issues.** axe (WCAG 2.0–2.2 A/AA) reports no serious or critical violations on sign-in, dashboard, users, invite, and profile. Skip link, focus trap entry, and Escape handling are tested.

## Test run
```
npm run test:unit                    →  28 passed (incl. 7 navigation tests)
tests/integration/dashboard.test.ts  →  11 passed (Neon test branch)
npm run test:e2e                     →  31 passed: auth 8 · users 7 · shell 16 (Chromium, production build)
npm run lint / typecheck / format    →  clean
npm run build                        →  success, no warnings
npm run check:bundle                 →  Client bundle clean (33 files checked)
```
The full integration suite (tenancy, auth, users, dashboard) runs in CI on every push.

## Screenshots
- Desktop dashboard (school admin): `img/task004-dashboard-desktop.png`
- Branch selector open: `img/task004-branch-menu.png`
- Mobile dashboard at 390 px: `img/task004-dashboard-mobile.png`
- Mobile navigation drawer: `img/task004-drawer-mobile.png`

## Fixes found during testing
- **Test reset deadlock.** The e2e reset could deadlock with the server still finishing the previous test's requests. It now runs in one transaction with a lock timeout and retries.

## Known limitations
- **Navigation items.** The navigation shows only modules that exist (Dashboard, Users, Profile, Platform). Academic, finance, and other groups appear as their tasks land.
- **Platform admin area.** The platform overview shows counts only. Onboarding and plan management come in Tasks 005 and 019.
- **Activity timestamps.** Recent activity times are shown in UTC. Per-school timezone display comes with school settings (Task 005).
- CI passed: https://github.com/McWDev/schools/actions/runs/38636048085
