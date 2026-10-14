# Task 008 — Student Admissions and Records

## Objective
Support student registration and lifecycle management.

## Scope
Admission form, school-scoped unique student number, status, guardian details, branch/class placement, documents/photo if required, transfer history, and duplicate-warning workflow.

## Acceptance criteria
- [ ] Student records are tenant-isolated.
- [ ] Student number uniqueness is enforced at database level within the agreed scope.
- [ ] Required fields are validated server-side.
- [ ] Sensitive fields are visible only to authorized roles.
- [ ] Branch transfers preserve history and cannot cross school tenants without a documented migration process.
- [ ] Create/edit/status changes are audited where appropriate.
