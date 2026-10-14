# Test, Verification, and Release Gates

## Mandatory task gate
A task is complete only when all items below are satisfied:
1. Requirements and implementation scope are clear.
2. Code and database changes are reviewed.
3. Automated tests for the task pass.
4. Relevant regression tests pass.
5. Security and branch-scope cases are tested.
6. Manual acceptance criteria are checked.
7. No known critical/high-severity defect remains unresolved.
8. Evidence is recorded: command output, test report, screenshots where useful, and known limitations.
9. The user reviews the result before the next task begins.

## Test layers
- Unit tests: business rules and permission logic.
- Integration tests: server services, database constraints, transactions, and auth.
- End-to-end tests: real user workflows through the application.
- Security regression tests: cross-branch leakage, IDOR, role escalation, unauthorized downloads.
- Manual UX tests: usability, responsive layout, accessibility basics.
- Operational tests: migrations, backups, restore, monitoring, and deployment.

## Access-isolation test matrix
At minimum test:
- A branch user requests another branch's student by ID: denied/not found.
- A branch user changes a URL, filter, or form field to another branch: denied/not found.
- Client forges `branch_id`, scope, role, or permission values: ignored or rejected.
- Export endpoint is requested with another branch's filter by a branch user: denied/not found.
- Background job cannot act without a validated user or system context.
- A role holder cannot grant themselves or others permissions they do not hold.
- A user removed from a school or branch loses access immediately or within a documented, tested session/cache invalidation window.

## Definition of done
- Acceptance criteria pass.
- No secrets in source control or logs.
- Database migration applies on a clean database.
- Rollback/recovery approach documented for risky changes.
- Accessibility and responsive checks completed for UI work.
- Audit events are generated for relevant privileged changes.
- Documentation is updated.
