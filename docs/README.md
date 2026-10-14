# School Management System — Documentation

## Purpose
This package defines the product, architecture, security rules, and sequential build-and-test tasks for a School Management System (SMS) for **one school with many branches** in different areas.

**Stack:** Node.js 24, Next.js 16 + TypeScript, Neon PostgreSQL.
**Product model:** each installation serves one school with its own database. The school runs several branches (campuses). School-wide administrators oversee every branch; branch staff are limited to their assigned branches unless explicitly granted wider access.

## How to use this package
1. Read `01_PRODUCT_REQUIREMENTS.md`, `02_ACCESS_MODEL.md`, `03_SECURITY_REQUIREMENTS.md`, and `04_ARCHITECTURE.md`.
2. Review `05_DATA_MODEL.md` and `06_UI_UX_GUIDELINES.md`.
3. Follow `TASKS/` in numeric order. Do not start the next task until the current task's acceptance criteria and tests pass.
4. Keep all project documentation in Markdown (`.md`).
5. Use `TASK_TEMPLATE.md` for each task and record evidence in `evidence/TASK_NNN.md`.

## Important implementation rule
A written plan cannot guarantee that a system has no bugs or security vulnerabilities. Security must be enforced in server-side code and database access patterns, then verified through automated tests, review, and staged deployment. Never treat a hidden UI element as an access-control mechanism.

## Task sequence
- Task 000 — repository, tooling, coding standards, and environment baseline
- Task 001 — data foundation and access isolation
- Task 002 — authentication, login, logout, password recovery, and session security
- Task 003 — user management, roles, permissions, invitations, and profile photos
- Task 004 — professional dashboard shell and navigation
- **Redesign R1 — single-school model (removed SaaS multi-tenancy)**
- Task 005 — school profile and settings
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
- Task 019 — system administration, configuration, and MFA
- Task 020 — end-to-end security, accessibility, performance, and acceptance testing
- Task 021 — production deployment, monitoring, backup restore drill, and handover

## Documentation index
- `01_PRODUCT_REQUIREMENTS.md`
- `02_ACCESS_MODEL.md`
- `03_SECURITY_REQUIREMENTS.md`
- `04_ARCHITECTURE.md`
- `05_DATA_MODEL.md`
- `06_UI_UX_GUIDELINES.md`
- `07_TEST_AND_RELEASE_GATES.md`
- `08_DEPLOYMENT_AND_OPERATIONS.md`
- `09_DECISIONS_AND_OPEN_QUESTIONS.md`
- `10_REPOSITORY_CONVENTIONS.md`
- `11_ACCESS_CONTROL_IMPLEMENTATION.md`
- `12_AUTHENTICATION.md`
- `13_USERS_AND_PERMISSIONS.md`
- `PROGRESS.md` — task status
- `TASK_TEMPLATE.md`
- `TASKS/` — one brief per implementation task
- `evidence/` — test evidence per task
