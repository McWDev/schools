# Task 003 — User Management, Roles, Permissions, and Profile Photos

## Objective
Allow authorized administrators to manage staff accounts safely.

## Scope
- User listing, search, pagination, invitations, activation/deactivation, and profile editing.
- Role/permission assignments and school/branch membership assignments.
- Profile photo upload to private storage with validation.
- School-wide admin can manage permitted users across the school's branches.
- Branch admin can manage only permitted users in assigned branch scope.
- Prevent self-escalation and unauthorized assignment of privileged roles.
- Audit invitations, role changes, deactivation, and scope changes.

## Acceptance criteria
- [ ] Permission checks are server-side for every action.
- [ ] Users cannot grant themselves roles or permissions.
- [ ] A school admin cannot manage another school's users.
- [ ] Branch admin cannot manage users outside their assigned scope unless granted permission.
- [ ] Photo uploads enforce actual format, size, and dimension limits.
- [ ] Deactivated users lose access according to documented session invalidation rules.
- [ ] Changes create appropriate audit events.

## Required tests
Test forged role payloads, cross-school user IDs, cross-branch edits, invalid photo types, oversized files, invitation replay, and deactivated sessions.
