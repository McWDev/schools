# Task 004 — Professional Dashboard Shell and Navigation

## Objective
Build the polished, responsive application shell and role-aware dashboard.

## Scope
- Sidebar, top navigation, school/branch context selector, account/profile menu.
- Dashboard summary cards based on real authorized data or clear empty states.
- Role-aware navigation; never use UI hiding as the only security control.
- Loading, empty, error, and success states.
- Responsive layout and accessible keyboard/focus behavior.
- Use a consistent design system and reusable components.

## Acceptance criteria
- [ ] Platform admin, school admin, branch admin, and teacher see appropriate navigation.
- [ ] School admin can switch between branches within their school where permitted.
- [ ] Branch users cannot select or query an unassigned branch.
- [ ] Dashboard metrics use scoped server-side queries; no fabricated live data.
- [ ] Core screens work on mobile, tablet, and desktop.
- [ ] Keyboard focus and labels are usable; no critical accessibility issues remain.

## Required tests
Role-based navigation, tenant/branch context switching, responsive viewport checks, loading/empty/error states, and attempts to fetch dashboard data outside the user's scope.
