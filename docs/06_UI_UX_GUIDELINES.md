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

## Design system (implemented)
- **Tokens** live in `src/app/globals.css`:
  - surfaces, borders, text (foreground / muted / subtle)
  - primary (indigo) and accent (teal)
  - status colors (success / warning / danger with matching surfaces)
  - the navy sidebar and the hero gradient
- **Themes:** Light, Dark, and System.
  - The choice is stored per browser (`localStorage.theme`).
  - An inline script in `<head>` applies it before the first paint, so there is no flash.
  - Without JavaScript, the operating-system preference is used.
  - Both themes must pass axe WCAG AA checks.
- **Shared components:**
  - `src/components/ui.tsx`: `buttonClass`, `PageHeader`, `Card`, `StatCard`, `Badge`, `Avatar`, `NoAccess`
  - `src/components/forms.tsx`: `TextField`, `SubmitButton`, `FormAlert`
  - `src/components/theme.tsx`: `ThemeToggle`, `THEME_SCRIPT`
- **Layout:** a navy sidebar with grouped navigation; a translucent sticky top bar with the branch selector and account menu; a hero banner on the dashboard; and a split-screen sign-in page with the school name.
- **Reduced motion** is respected (`prefers-reduced-motion`).
