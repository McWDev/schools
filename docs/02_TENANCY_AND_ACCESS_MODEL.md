# SaaS Tenancy and Access Model

## 1. Recommended initial model
Use a **shared PostgreSQL database with shared tables and tenant scoping**, backed by strict server-side authorization. Every tenant-owned row carries `school_id`; branch-scoped rows also carry `branch_id` where applicable.

This is usually simpler and more cost-effective for an initial SaaS product than one database per school. If future enterprise customers require physical isolation, assess a separate-database option as a deliberate architecture change.

## 2. Hierarchy
- SaaS platform
  - School tenant
    - School-wide settings and records
    - Branch/campus A
    - Branch/campus B
    - Branch/campus N
  - Other school tenant (completely isolated)

A branch belongs to exactly one school. A record must never reference a branch belonging to a different school.

## 3. Tenant context
- Resolve the authenticated user's school membership on the server.
- Do not trust `school_id`, `branch_id`, role, or permission values supplied by the browser.
- Derive tenant scope from the authenticated session and active membership.
- If a user belongs to multiple schools, require an explicit, server-validated school context switch.
- Every API route, server action, background job, export, and report must enforce the same scope rules.
- Never rely only on frontend filtering.

## 4. Access scope
- `platform`: SaaS platform operations only.
- `school`: all branches and school-wide data for one school.
- `branch`: one or more explicitly assigned branches within one school.
- `self`: the user's own profile or personal records.
- `linked_children`: verified children linked to a guardian account.

Permissions should be granular (e.g. `students.read`, `students.create`, `attendance.mark`, `marks.approve`, `fees.receive`, `reports.export`) and combined with scope. Avoid relying on role names alone.

## 5. Initial role examples
| Role | Typical scope | Example permissions |
|---|---|---|
| Platform super admin | Platform | Manage tenant lifecycle, plans, platform health; exceptional data access audited |
| School owner/admin | School | Manage branches, users, school settings, all school reports |
| Branch admin | Assigned branch | Manage branch operations and branch users within delegated rights |
| Teacher | Assigned classes/subjects | View class lists, record attendance, enter permitted marks |
| Registrar | Assigned branch or school | Admissions and student records |
| Finance officer | Assigned branch or school | Fees, receipts, finance reports |
| Parent/guardian | Linked children | View permitted child information |
| Student | Self | View own permitted records |
| Auditor | Explicit read-only scope | View approved reports and logs |

These are starting templates. Permission grants must be configurable and audited.

## 6. Database safeguards
- Use foreign keys and unique constraints that include tenant scope where needed.
- Consider composite keys/constraints such as `(school_id, branch_id)` relationships to prevent cross-tenant branch references.
- Add indexes beginning with `school_id` for common tenant-filtered queries.
- Consider PostgreSQL Row-Level Security (RLS) as defense in depth. If RLS is used, carefully design connection pooling and transaction-scoped tenant context; test that context cannot leak between pooled connections.
- Database access must be server-side only. Never expose the Neon connection string to the browser.
- Use separate least-privilege database roles for migrations and runtime if the deployment model supports it.

## 7. Tenant lifecycle
- `pending`: created but not active.
- `active`: normal access.
- `suspended`: access blocked, data retained.
- `closed`: access blocked; export/retention process applies.
- Avoid hard deletion of a tenant as a routine admin action.
- Any exceptional cross-tenant support access must be time-limited, approved, purpose-recorded, and audited. Prefer support metadata and impersonation-free diagnostics.

## 8. Branch lifecycle
- Branch creation requires an authorized school-level user.
- Branch deactivation prevents new operational activity as configured but preserves historical records.
- Do not delete students, marks, payments, or attendance when a branch is closed.
- Moving a user between branches must invalidate or re-check cached permissions and active sessions as appropriate.
