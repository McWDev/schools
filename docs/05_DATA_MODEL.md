# Initial Data Model (Conceptual)

This is a conceptual model, not a final SQL schema. Confirm field-level requirements during the relevant tasks.

## Core entities
- `schools`: tenant ID, name, slug, status, locale/timezone, created/updated timestamps.
- `branches`: branch ID, school ID, name, code, status, address/contact fields, timestamps.
- `users`: global login identity, normalized email/username, password/auth provider reference, status, profile photo reference, timestamps.
- `school_memberships`: user ID, school ID, membership status, default scope.
- `roles`: school-scoped or platform-scoped role definitions as appropriate.
- `permissions`: stable permission codes.
- `role_permissions`: role-to-permission mapping.
- `membership_roles`: roles assigned to a membership.
- `user_branch_assignments`: membership/user and branch assignments.
- `sessions` / auth tables: based on selected authentication library.
- `audit_events`: actor, school/branch context, action, target reference, timestamp, outcome, safe metadata.
- `subscription_plans`: plan code, limits, feature flags, status.
- `school_subscriptions`: school, plan, status, period, provider references if billing is enabled.

## Academic entities (later tasks)
- `academic_years`, `terms`
- `grade_levels`, `classes`, `sections`
- `students`, `student_guardians`, `student_branch_history`
- `staff`, `teacher_assignments`
- `subjects`, `class_subjects`, `timetables`
- `attendance_sessions`, `attendance_records`, `attendance_corrections`
- `exams`, `assessment_components`, `marks`, `grading_scales`, `report_cards`
- `fee_structures`, `student_invoices`, `payments`, `receipts`, `discounts`

## Data integrity rules
- Every tenant-owned entity includes `school_id`, directly or through a rigorously enforced parent relationship.
- Branch-scoped entities include `branch_id` and enforce that the branch belongs to the same school.
- Prefer stable internal UUIDs for primary keys and human-readable numbers/codes as separate fields.
- Unique constraints should state their scope, e.g. student number unique per school, not necessarily globally.
- Use soft deactivation for records with history; do not cascade-delete financial, attendance, marks, or audit history.
- Define update/delete behavior explicitly for each foreign key.
- Timestamps should be stored consistently (normally UTC) and displayed in the school's configured timezone.
- Do not store derived totals as authoritative unless there is a documented reconciliation strategy.
