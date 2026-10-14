# Product Requirements Document (PRD)

## 1. Product vision
Build a clean, professional, secure, multi-tenant School Management SaaS that lets many independent schools manage their academic and administrative operations in one hosted platform without exposing data across schools.

## 2. Goals
- Host multiple schools (tenants) in one SaaS application.
- Let each school create multiple sub-branches/campuses.
- Give a school-wide administrator visibility and management across all branches belonging to that school.
- Restrict branch users to their assigned branch unless a documented permission grants wider scope.
- Start with secure login, user management, and a polished dashboard, then build academic modules in small verified tasks.
- Maintain an auditable record of sensitive administrative actions.
- Make the interface responsive, accessible, understandable, and consistent.

## 3. Out of scope for the first release
- Native iOS/Android applications.
- Offline-first synchronization.
- AI grading or automated high-stakes student decisions.
- Country-specific statutory accounting or government integrations until requirements are confirmed.
- A guarantee of zero defects. The goal is risk reduction through controls and evidence-based testing.

## 4. User groups
1. **SaaS platform super administrator:** operates the SaaS platform, manages tenant lifecycle and platform configuration. This role must not routinely browse school records; exceptional access must be controlled and audited.
2. **School owner / school-wide administrator:** manages their own school tenant and all its branches, users, settings, and reports.
3. **Branch administrator:** manages the assigned branch within delegated permissions.
4. **Teacher:** sees assigned classes, subjects, attendance, and permitted student data.
5. **Admissions/registrar staff:** manages student admissions and approved student-record fields.
6. **Finance staff:** manages permitted fee and payment workflows.
7. **Student:** sees only their own permitted records if a student portal is enabled.
8. **Parent/guardian:** sees only records of linked children for which the relationship is verified.
9. **Auditor/read-only user:** can view only explicitly permitted reports and audit records.

## 5. Core requirements
### SaaS and tenant management
- Every school is a separate tenant with a stable internal ID.
- Tenant-owned records must be linked to a tenant ID and protected by server-side authorization and database safeguards.
- Schools must never be able to query or mutate another school's records.
- A school may create, rename, deactivate, and manage its own branches within plan limits.
- A school-wide administrator can view data from all branches of that school.
- Branch-level staff can access only assigned branch data by default.
- Tenant deactivation must block normal sign-in/access without deleting records.
- Tenant deletion and data export must be controlled, logged, and subject to a retention policy.

### Authentication and user management
- Secure login and logout.
- Password reset with expiring, single-use tokens.
- Secure session lifecycle and revocation.
- User invitations, activation/deactivation, role assignment, branch assignment, and profile management.
- Profile photo upload with file-type/size validation and safe storage.
- No public sign-up that automatically grants school administration. Tenant creation must use a controlled onboarding flow.
- Optional MFA should be supported in the security roadmap; require it for platform super administrators and highly privileged accounts where feasible.

### Dashboard
- Responsive sidebar/navigation, top bar, current school/branch context, profile menu, alerts, and clear page titles.
- Role-appropriate summary cards and recent activity.
- Empty states, loading states, error states, and accessible form feedback.
- Dashboard data must be scoped to the signed-in user's tenant and branch permissions.
- Avoid displaying sensitive student, financial, or personal data on the dashboard unless needed for that role.

### Student and academic operations
- Academic years and terms/semesters.
- Grade levels, classes, sections, subjects, and timetables.
- Student admission, unique school-level student number, status, guardian links, and transfer history.
- Staff and teacher records, employment status, qualifications, and branch assignments.
- Attendance by class/session with correction history.
- Exams, marks, grading rules, report cards, and approval workflows where required.
- Reports filtered by permitted school/branch scope.

### Finance
- Fee structures, invoices, payments, receipts, balances, discounts/waivers, and arrears.
- Finance actions must be permissioned and audited.
- Do not store payment card data directly. Use a compliant payment provider if online card payments are added.
- Currency, tax, numbering, and receipt requirements must be confirmed before implementation.

### Communication and optional modules
- Notifications and announcements with recipient scoping.
- Parent/guardian portal with verified child relationships.
- Library, transport, and facilities can be enabled as later modules without weakening core tenant isolation.

## 6. Non-functional requirements
- Security: least privilege, deny by default, tenant isolation, secure sessions, audit logs, encrypted transport, managed secrets.
- Reliability: documented backups and tested restore process.
- Performance: pagination for large lists, indexed query patterns, no unbounded table fetches.
- Accessibility: target WCAG 2.2 AA for core workflows where practical.
- Maintainability: TypeScript strict mode, consistent linting/formatting, migrations, automated tests, code review.
- Usability: responsive layouts, plain language, consistent components, useful validation messages.
- Observability: structured logs, error monitoring, uptime/latency alerts without logging passwords, tokens, or unnecessary personal data.

## 7. Success criteria
- Cross-tenant access tests pass for every tenant-owned module.
- School-wide admins can see all branches of their own school but cannot access other schools.
- Branch users cannot access other branches by changing URL, IDs, filters, or API payloads.
- Authentication, password reset, invitations, role changes, and session revocation tests pass.
- Critical flows are covered by automated tests and a documented manual acceptance checklist.
- Backup restoration is demonstrated in a non-production environment before launch.
