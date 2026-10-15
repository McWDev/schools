# Evidence: Task 006, Branch / Campus Management

Date: 2026-10-14 · Branch: `task/006-branch-management`

## What was built
- **Branches section** ("School → Branches" in the navigation, for `branches.read`):
  - **List:** a card grid with name, area, code, status (Active / Inactive, as text), and assigned-staff count. Active branches come first. There is an empty state for a new school.
  - **Open branch** (`/dashboard/branches/new`): name, unique code, area, address, phone, and email.
  - **Branch page:**
    - details (editable by school-wide administrators, read-only for others)
    - deactivate / reopen with confirmation that explains the consequences
    - the list of assigned staff, linking to each person (for `users.read`)
- **Service** (`src/server/modules/branches/service.ts`):
  - `listBranchSummaries`, `listBranchStaff`, `setBranchStatus`, and `DuplicateBranchCodeError` (a friendly message instead of a raw database error)
  - optional fields normalized to "not set"
  - `.strict()` payloads
- **Who can do what:** opening, editing, and deactivating require `branches.manage` **and** school-wide scope. Branch administrators and teachers are read-only, and only for their own branches.
- **Deactivation never deletes anything.** Assignments, records, and audit history stay. An inactive branch leaves the branch selector, dashboard counts, and branch filters, and can be reopened. The application role has no `DELETE` on branches.
- **Audit:** `branch.create`, `branch.update` (changed field names), `branch.deactivate`, and `branch.reactivate`, each tied to the branch.
- **Process fix found while testing Task 005:** `npm run check` now runs `build:ci`, a production build with database variables blanked, exactly as CI does. A page or route that queries the database at build time now fails locally, not only in CI.

## Acceptance criteria
- [x] **Only authorized school-level users create or deactivate branches.** Branch admin and teacher get `ForbiddenError` for create, update, and status changes (integration), and the no-access page for `/branches/new` (e2e).
- [x] **Branches always belong to this school.** It is a single-school system; codes are unique.
- [x] **School-wide admins see all branches.** Covered by the list, selector, and counts tests.
- [x] **Branch staff see only assigned branches.** Covered by the list (integration and e2e) and by out-of-scope IDs rendering "not found".
- [x] **Deactivation does not delete historical data.** Staff assignments and audit events survive, the branch is still listed as inactive, and reopening restores it.

## Test run
_Filled in after the final runs._
