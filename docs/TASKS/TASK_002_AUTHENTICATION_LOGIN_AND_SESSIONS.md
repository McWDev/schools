# Task 002 — Authentication, Login, Logout, Password Recovery, and Sessions

## Objective
Deliver secure authentication for platform and school users.

## Scope
- Compare maintained authentication solutions compatible with the selected Next.js version and Neon/ORM choice.
- Document the selected option and why.
- Implement login, logout, password reset, session lifecycle, and protected routes.
- Implement a secure bootstrap process for the first platform administrator.
- Add rate limits and generic password-reset responses.
- Ensure every authenticated request resolves membership and tenant context server-side.

## Acceptance criteria
- [ ] Unauthenticated users cannot access protected pages or data endpoints.
- [ ] Login/logout works and session cookies use appropriate secure settings in production.
- [ ] Password reset tokens are single-use, expiring, and not stored in plaintext.
- [ ] Suspended/deactivated users cannot continue using the system.
- [ ] Tenant context cannot be set by a forged browser payload.
- [ ] Login and reset rate limits are tested.
- [ ] Secrets never appear in logs or URLs.

## Required tests
Test valid/invalid login, logout, expired session, reset expiry/replay, account deactivation, rate limiting, and direct access to protected endpoints.
