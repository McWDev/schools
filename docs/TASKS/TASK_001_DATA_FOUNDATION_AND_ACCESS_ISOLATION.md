# Task 001 — Data Foundation and Access Isolation

> Completed. Originally built as a multi-school foundation and converted to the single-school model in redesign R1. See [REDESIGN_R1](../evidence/REDESIGN_R1.md).

## Objective
Create the core school, branch, and staff-access model, and enforce branch isolation before sensitive modules are added.

## Scope
- Configure Neon PostgreSQL for development.
- Choose and configure one ORM/query layer.
- Create migrations for the school profile, branches, staff access foundations, and audit events.
- Implement a server-side access context and scoped data-access helpers.
- Add synthetic test data: one school with several branches and staff at each scope.
- Use PostgreSQL row-level security as defense in depth; document transaction and connection-pooling behavior and test it.

## Acceptance criteria
- [ ] Migrations work on a clean database.
- [ ] Branch staff cannot read or change records of branches they are not assigned to.
- [ ] Missing or forged access context fails closed.
- [ ] Browser/client code cannot access the database connection string.
- [ ] Access-isolation regression tests run automatically.

## Required adversarial tests
- Forge scope, branch, or permission values in a request.
- Guess another branch's row ID.
- Run a query that forgets to filter by branch; RLS must still hide other branches.
- Call a data helper without an access context.
- Test connection pooling for access-context leakage.
