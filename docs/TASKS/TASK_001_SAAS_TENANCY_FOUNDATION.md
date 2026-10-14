# Task 001 — SaaS Tenancy Foundation and Database Isolation

## Objective
Create the core tenant/branch model and enforce school isolation before sensitive modules are added.

## Scope
- Configure Neon PostgreSQL for development.
- Choose and configure one ORM/query layer.
- Create initial migrations for `schools`, `branches`, membership/access foundations, and audit events as agreed by the implementation plan.
- Add constraints so branches cannot be linked to the wrong school.
- Implement server-side tenant context and tenant-scoped data access helpers.
- Add seeded synthetic test tenants: School A and School B, each with branches.
- Decide whether RLS is used; if yes, document transaction and connection-pooling behavior and test it.

## Acceptance criteria
- [ ] Migrations work on a clean database.
- [ ] School A cannot read or mutate School B's test records.
- [ ] A branch cannot be associated with another school's ID.
- [ ] Missing tenant context fails closed.
- [ ] Browser/client code cannot access the database connection string.
- [ ] Tenant-isolation regression tests run automatically.

## Required adversarial tests
- Forge `school_id` in a request.
- Guess another school's row ID.
- Submit a branch ID from another school.
- Try to call a data helper without tenant context.
- If RLS is enabled, test connection pooling for tenant-context leakage.

## Gate
Do not implement students, fees, or other real-data modules until these tests pass and have been reviewed.
