# Data Model

The live schema is `src/server/db/schema.ts`; migrations in `drizzle/` are authoritative. This page summarizes it and plans later tables.

## Core entities (built)
| Table | Purpose |
|---|---|
| `school_settings` | The school's profile: name, short name, timezone, locale, and contacts. Exactly one row (`id = 1`). |
| `branches` | Campuses: name, unique code, **area**, status, address, and contacts. |
| `users` | Staff accounts: normalized email, name, status, **access scope** (`school` or `branch`), password hash, and photo key. |
| `user_branches` | Branches a branch-scoped user works in. |
| `permissions` | Stable permission codes, defined by migrations. |
| `roles` / `role_permissions` | System roles and their permissions. |
| `user_roles` | Roles held by each user. |
| `user_invitations` | Hashed, single-use account-setup tokens. |
| `sessions` | Hashed session tokens, expiry, revocation, and branch filter. |
| `password_reset_tokens` | Hashed, single-use reset tokens. |
| `auth_rate_limits` | Sign-in and reset counters, with hashed keys. |
| `audit_events` | Append-only: actor, action, optional branch, target, outcome, and safe metadata. |

## Academic entities (later tasks)
Every branch-scoped table carries `branch_id` (an FK to `branches`):
- `academic_years`, `terms` (school-wide)
- `grade_levels` (school-wide); `classes`, `sections` (per branch)
- `students` (current `branch_id`, school-wide unique student number), `student_guardians`, `student_branch_history`
- `staff_profiles`, `teacher_assignments`
- `subjects`, `class_subjects`, `timetables`
- `attendance_sessions`, `attendance_records`, `attendance_corrections`
- `exams`, `assessment_components`, `marks`, `grading_scales`, `report_cards`
- `fee_structures`, `student_invoices`, `payments`, `receipts`, `discounts`

## Data integrity rules
- Branch-scoped entities include `branch_id` and are filtered by the user's branches; RLS enforces the same rule.
- Use stable internal UUIDs for primary keys, with human-readable numbers and codes as separate unique fields.
- Unique constraints state their scope explicitly (for example, student number unique school-wide, class name unique per branch and academic year).
- Use soft deactivation for records with history. Never cascade-delete financial, attendance, marks, or audit history.
- Define update/delete behaviour explicitly for each foreign key.
- Store timestamps in UTC and display them in the school's timezone.
- Do not store derived totals as authoritative unless there is a documented reconciliation strategy.
