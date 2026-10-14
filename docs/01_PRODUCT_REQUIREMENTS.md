# Product Requirements Document (PRD)

## 1. Product vision
Build a clean, professional, secure School Management System for one school that operates several branches (campuses) in different areas, so the whole school runs its academic and administrative work in one place.

Each installation serves exactly one school with its own database. A different school would get its own separate installation.

## 2. Goals
- Run one school with many branches in different areas.
- Give school-wide administrators visibility and management across every branch.
- Restrict branch staff to their assigned branches unless a documented permission grants wider scope.
- Start with secure login, user management, and a polished dashboard, then build academic modules in small verified tasks.
- Keep an auditable record of sensitive administrative actions.
- Make the interface responsive, accessible, understandable, and consistent.

## 3. Out of scope for the first release
- Hosting several independent schools in one installation (multi-tenant SaaS), subscription plans, and billing.
- Native iOS/Android applications.
- Offline-first synchronization.
- AI grading or automated high-stakes student decisions.
- Country-specific statutory accounting or government integrations until requirements are confirmed.
- A guarantee of zero defects. The goal is risk reduction through controls and evidence-based testing.

## 4. User groups
1. **School administrator:** manages the school profile, every branch, staff, settings, and reports.
2. **Branch administrator:** manages the assigned branch(es) within delegated permissions.
3. **Teacher:** sees assigned classes, subjects, attendance, and permitted student data.
4. **Admissions/registrar staff:** manages student admissions and approved student-record fields.
5. **Finance staff:** manages permitted fee and payment workflows.
6. **Student:** sees only their own permitted records, if a student portal is enabled.
7. **Parent/guardian:** sees only records of linked children whose relationship is verified.
8. **Auditor/read-only user:** can view only explicitly permitted reports and audit records.

## 5. Core requirements
### School and branches
- The school has one profile (name, logo, contacts, timezone) edited in Settings.
- The school can open, rename, and deactivate branches. Each branch records the area it serves.
- School-wide administrators can work across all branches.
- Branch staff can access only their assigned branches by default.
- Deactivating a branch preserves its history (students, marks, payments, attendance).

### Authentication and user management
- Secure login and logout.
- Password reset with expiring, single-use tokens.
- Secure session lifecycle and revocation.
- Staff invitations, activation/deactivation, role assignment, branch assignment, and profile management.
- Profile photo upload with file-type/size validation and safe storage.
- No public sign-up. The first administrator is created by a one-time setup command; everyone else is invited.
- MFA for school administrators before production.

### Dashboard
- Responsive sidebar/navigation, top bar, current branch context, profile menu, alerts, and clear page titles.
- Role-appropriate summary cards and recent activity.
- Empty states, loading states, error states, and accessible form feedback.
- Dashboard data must be scoped to the signed-in user's branch permissions.
- Avoid showing sensitive student, financial, or personal data on the dashboard unless the role needs it.

### Student and academic operations
- Academic years and terms/semesters.
- Grade levels, classes, sections, subjects, and timetables per branch.
- Student admission, a unique school-wide student number, status, guardian links, and branch transfer history.
- Staff and teacher records, employment status, qualifications, and branch assignments.
- Attendance by class/session with correction history.
- Exams, marks, grading rules, report cards, and approval workflows where required.
- Reports filtered by permitted branch scope.

### Finance
- Fee structures, invoices, payments, receipts, balances, discounts/waivers, and arrears.
- Finance actions must be permissioned and audited.
- Do not store payment card data directly. Use a compliant payment provider if online card payments are added.
- Currency, tax, numbering, and receipt requirements must be confirmed before implementation.

### Communication and optional modules
- Notifications and announcements with recipient scoping by branch, class, or role.
- Parent/guardian portal with verified child relationships.
- Library, transport, and facilities can be enabled later without weakening the core access model.

## 6. Non-functional requirements
- **Security:** least privilege, deny by default, branch scoping, secure sessions, audit logs, encrypted transport, managed secrets.
- **Reliability:** documented backups and a tested restore process.
- **Performance:** pagination for large lists, indexed query patterns, no unbounded table fetches.
- **Accessibility:** target WCAG 2.2 AA for core workflows where practical.
- **Maintainability:** TypeScript strict mode, consistent linting/formatting, migrations, automated tests, code review.
- **Usability:** responsive layouts, plain language, consistent components, useful validation messages.
- **Observability:** structured logs, error monitoring, and uptime/latency alerts, without logging passwords, tokens, or unnecessary personal data.

## 7. Success criteria
- School-wide admins can see all branches. Branch users cannot reach other branches by changing URLs, IDs, filters, or payloads.
- Authentication, password reset, invitations, role changes, and session revocation tests pass.
- Critical flows are covered by automated tests and a documented manual acceptance checklist.
- Backup restoration is demonstrated in a non-production environment before launch.
