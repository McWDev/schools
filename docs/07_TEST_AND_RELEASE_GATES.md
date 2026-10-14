# Test, Verification, and Release Gates

## Mandatory task gate
A task is complete only when all items below are satisfied:
1. Requirements and implementation scope are clear.
2. Code and database changes are reviewed.
3. Automated tests for the task pass.
4. Relevant regression tests pass.
5. Security and tenant-scope cases are tested.
6. Manual acceptance criteria are checked.
7. No known critical/high-severity defect remains unresolved.
8. Evidence is recorded: command output, test report, screenshots where useful, and known limitations.
9. The user reviews the result before the next task begins.

## Test layers
- Unit tests: business rules and permission logic.
- Integration tests: server services, database constraints, transactions, and auth.
- End-to-end tests: real user workflows through the application.
- Security regression tests: tenant leakage, IDOR, role escalation, unauthorized downloads.
- Manual UX tests: usability, responsive layout, accessibility basics.
- Operational tests: migrations, backups, restore, monitoring, and deployment.

## Tenant-isolation test matrix
At minimum test:
- School A admin requests School B student by ID: denied/not found.
- School A branch user requests another branch's student: denied/not found.
- Client forges `school_id` or `branch_id`: ignored or rejected.
- Export endpoint is requested with another tenant's filter: denied/not found.
- Background job cannot use an unvalidated tenant identifier to access another school's data.
- A user removed from a school or branch loses access immediately or within a documented, tested session/cache invalidation window.

## Definition of done
- Acceptance criteria pass.
- No secrets in source control or logs.
- Database migration applies on a clean database.
- Rollback/recovery approach documented for risky changes.
- Accessibility and responsive checks completed for UI work.
- Audit events are generated for relevant privileged changes.
- Documentation is updated.
