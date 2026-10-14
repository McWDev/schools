# UI/UX and Design System Requirements

## Visual direction
A modern, professional school administration product: clean structure, calm neutral surfaces, strong typography, consistent spacing, clear hierarchy, restrained accent color, and minimal decorative clutter.

## Application shell
- Responsive left sidebar with grouped navigation.
- Top bar with school context, optional branch selector, search where appropriate, notifications, and account/profile menu.
- Clear page title and short contextual description.
- Breadcrumbs for deeper workflows.
- Sidebar and top bar must adapt to small screens without hiding essential actions.

## Dashboard
- Greeting and active school/branch context.
- Role-specific summary cards; do not show data the role cannot access.
- Useful next actions (e.g. add student, invite staff) according to permission.
- Recent activity limited to authorized records.
- Clear empty state for a newly onboarded school.
- Avoid fake metrics or hardcoded production-looking numbers.

## Interaction rules
- Every form has labels, validation, loading state, success/failure feedback, and safe retry behavior.
- Destructive actions require confirmation and explain consequences.
- Use accessible keyboard focus, semantic headings, adequate contrast, and meaningful error text.
- Tables support pagination, sorting where useful, empty/loading/error states, and responsive behavior.
- Do not use color alone to communicate status.
- Avoid placing many unrelated controls in one crowded screen.
- Confirm branch context before branch-scoped changes; make the current scope visible.

## Design acceptance criteria
- Common workflows can be completed with keyboard navigation.
- Layout works at mobile, tablet, and desktop breakpoints.
- No horizontal overflow in core screens at supported viewport sizes.
- Form errors identify the field and explain the correction.
- Dashboard cards and navigation reflect actual permissions and scoped data.
- All interactive controls have clear names and visible focus states.
