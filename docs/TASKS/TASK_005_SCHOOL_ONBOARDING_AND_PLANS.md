# Task 005 — School Onboarding and Subscription-Ready Plans

## Objective
Allow controlled creation and activation of independent school tenants.

## Scope
- Create school tenant and initial school owner through an authorized onboarding flow.
- Tenant status lifecycle: pending, active, suspended, closed.
- Plan model with configurable branch/student/staff/storage limits and feature flags.
- Subscription payment integration may remain out of scope until provider and market requirements are decided.
- Log tenant creation, activation, suspension, and plan changes.

## Acceptance criteria
- [ ] A new school cannot view another tenant's information.
- [ ] Tenant creation does not expose an unrestricted admin signup path.
- [ ] Tenant status is enforced server-side.
- [ ] Plan limits are validated server-side.
- [ ] Suspension blocks normal access but preserves records.
