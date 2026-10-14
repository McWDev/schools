# Task 019 — System Administration and Configuration

## Objective
Give the school administrator safe control over system-level configuration and security.

## Scope
- MFA (authenticator app) for school administrators and other high-privilege roles.
- Active sessions view: sign out other devices; administrators can revoke a user's sessions.
- Feature toggles for optional modules (library, transport, and so on).
- Email/SMS delivery settings and test messages (provider chosen in Task 017).
- System health page: database connectivity, last backup status, and app version.

## Acceptance criteria
- [ ] MFA is required for school administrators before production.
- [ ] Configuration changes require recent re-authentication and are audited.
- [ ] Disabling a module hides it and blocks its server actions and routes.
- [ ] Secrets are never displayed after being saved.
