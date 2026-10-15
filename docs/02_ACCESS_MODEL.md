# Access Model: One School, Many Branches

## 1. Model
One installation serves exactly one school. The school operates several **branches** (campuses), each in its own area. Every staff account has an **access scope**:

- `school`: every branch and all school-wide data (school administrators, auditors, central finance).
- `branch`: only the branches assigned to the person (branch administrators, teachers, branch registrars).

Later modules add `self` (students viewing their own records) and `linked_children` (guardians), when those portals are built.

```
Installation (one database)
└── School profile (name, logo, timezone)
    ├── Branch: Main Campus (Central)
    ├── Branch: North Campus (North)
    └── Branch: … (Area N)

Staff ── access scope (school | branch) ── assigned branches ── roles ── permissions
```

## 2. Rules
- The server resolves the signed-in user's scope, branches, and permissions on every request. Browser-supplied scope, branch, role, or permission values are never trusted.
- Every branch-scoped record (students, classes, attendance, fees, and so on) carries `branch_id`. Queries filter by the user's branches before fetching rows.
- Background jobs, exports, reports, file downloads, and notifications apply the same rules.
- Missing or invalid access context denies by default.

## 3. Permissions and roles
Permissions are granular codes (for example `users.invite`, `branches.manage`, `attendance.mark`) granted through roles. Code checks permissions, never role names.

| Role | Typical scope | Example permissions |
|---|---|---|
| School administrator | School | Branches, staff, settings, all reports, audit log |
| Branch administrator | Assigned branches | Branch staff and operations within delegated rights |
| Teacher | Assigned branches/classes | Class lists, attendance, permitted marks |
| Registrar | Branch or school | Admissions and student records |
| Finance officer | Branch or school | Fees, receipts, finance reports |
| Auditor | School, read-only | Approved reports and the audit log |
| Parent/guardian (later) | Linked children | Permitted child information |
| Student (later) | Self | Own permitted records |

Nobody can grant a permission they do not hold, change their own access, or manage someone with more access than themselves.

## 4. Database safeguards
- Foreign keys tie branch-scoped rows to `branches`, and unique constraints are explicit (for example, branch code unique, student number unique school-wide).
- Index `branch_id` for branch-filtered queries.
- PostgreSQL row-level security is defense in depth: the app connects as a restricted role, and policies require a signed-in user context plus branch scope. The context is transaction-local, so it cannot leak between pooled connections.
- Database access is server-side only. The Neon connection string never reaches the browser.
- Migrations and runtime use separate database roles.

## 5. Branch lifecycle
- Opening a branch requires a school-wide user with `branches.manage`.
- Deactivating a branch stops new operational activity but preserves historical records.
- Students, marks, payments, and attendance are never deleted when a branch closes.
- Moving staff between branches takes effect on their next request, because access is re-resolved every time.

## 6. Academic structure scope
| Record | Scope | Who changes it | Uniqueness |
|---|---|---|---|
| Academic year | School-wide | School-wide users with `academics.configure` | Name unique; exactly one current year |
| Term | School-wide, inside one year | Same | Name and position unique within the year; dates inside the year |
| Grade level | School-wide | Same | Name and code unique |
| Class | One branch, one year, one grade | `classes.manage` within the user's branches | One class per branch, year, and grade |
| Section | The branch of its class | Same | Name unique within the class |

Every signed-in user with `academics.read` can read years, terms, and grade levels. Classes and sections are visible only inside the user's branches, enforced by row-level security as well as the service layer. Nothing is deleted: records are archived (and can be restored), and the application role has no `DELETE` privilege on these tables.

## 7. Student records
- A student belongs to exactly one branch at a time (`students.branch_id`). Branch staff see only students of their branches; this is enforced by the service layer and by row-level security on `students`, `student_guardians`, and `student_transfers`.
- **Student numbers** are issued by the database (`YYYY-NNNNN` from `student_number_seq`), are unique across the whole school (`students_student_number_key`), and can never be changed (trigger).
- **Sensitive fields** (student phone, home address, medical notes, guardian phone and email) are loaded and accepted only for users with `students.read_sensitive`. Teachers, finance officers, and auditors see names, numbers, classes, photos, and statuses.
- **Photos** are optional, decoded and re-encoded to a 512 × 512 WebP on upload (JPEG, PNG, or WebP up to 2 MB), and served by `/api/students/{id}/photo` only to staff who can see that student; everyone else gets 404.
- **Duplicate warning**: admission checks for students anywhere in the school with the same name and date of birth. Staff learn only how many matches exist, never the other branch's record, and must confirm before admitting.
- **Transfers** move the student, their guardians, and future work to the new branch, end the class placement, and add a row to the append-only transfer history. Both branches must be in the user's scope (also enforced by RLS). Nothing about a student is ever deleted; leaving the school is a status (`withdrawn`, `graduated`).
