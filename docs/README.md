# School Management SaaS — Documentation Package

## Purpose
This package defines the product, architecture, security rules, and sequential build-and-test tasks for a multi-tenant School Management System (SMS).

**Stack:** Node.js runtime, Next.js + TypeScript, Neon PostgreSQL.  
**Product model:** SaaS platform hosting multiple independent schools. Each school can create and manage sub-branches/campuses. School-level administrators can oversee all branches belonging to their school; branch staff are restricted to their assigned branch unless explicitly granted wider access.

## How to use this package
1. Read `01_PRODUCT_REQUIREMENTS.md`, `02_TENANCY_AND_ACCESS_MODEL.md`, `03_SECURITY_REQUIREMENTS.md`, and `04_ARCHITECTURE.md`.
2. Review `05_DATA_MODEL.md` and `06_UI_UX_GUIDELINES.md`.
3. Follow `TASKS/` in numeric order. Do not start the next task until the current task's acceptance criteria and tests pass.
4. Keep all project documentation in Markdown (`.md`). Source code, configuration, migrations, and automated tests will still need their normal file types when the actual application is built; this requirement applies to this documentation package.
5. Use `TASK_TEMPLATE.md` for each future task and record evidence in `TEST_AND_RELEASE_GATES.md`.

## Important implementation rule
A written plan cannot guarantee that a system has no bugs or security vulnerabilities. Security must be enforced in server-side code and database access patterns, then verified through automated tests, review, and staged deployment. Never treat a hidden UI element as an access-control mechanism.

## Task sequence
- Task 000 — repository, tooling, coding standards, and environment baseline
- Task 001 — SaaS tenancy foundation and database isolation
- Task 002 — authentication, login, logout, password recovery, and session security
- Task 003 — user management, roles, permissions, invitations, and profile photos
- Task 004 — professional dashboard shell and navigation
- Task 005 — school tenant onboarding and subscription-ready plan model
- Task 006 — branch/campus management
- Task 007 — academic year, terms, grades, classes, and sections
- Task 008 — student admissions and student records
- Task 009 — staff and teacher records
- Task 010 — subjects, class assignments, and timetables
- Task 011 — attendance
- Task 012 — exams, marks, grading, and report cards
- Task 013 — fees, invoices, receipts, and balances
- Task 014 — parent/guardian portal and communications
- Task 015 — library, transport, and optional facilities
- Task 016 — reports, exports, and dashboards
- Task 017 — notifications and messaging
- Task 018 — audit logs, backups, retention, and data export
- Task 019 — SaaS super-admin operations, plans, quotas, and billing integration
- Task 020 — end-to-end security, accessibility, performance, and acceptance testing
- Task 021 — production deployment, monitoring, backup restore drill, and handover

## Documentation index
- `01_PRODUCT_REQUIREMENTS.md`
- `02_TENANCY_AND_ACCESS_MODEL.md`
- `03_SECURITY_REQUIREMENTS.md`
- `04_ARCHITECTURE.md`
- `05_DATA_MODEL.md`
- `06_UI_UX_GUIDELINES.md`
- `07_TEST_AND_RELEASE_GATES.md`
- `08_DEPLOYMENT_AND_OPERATIONS.md`
- `09_DECISIONS_AND_OPEN_QUESTIONS.md`
- `TASK_TEMPLATE.md`
- `TASKS/` — one Markdown brief per implementation task
