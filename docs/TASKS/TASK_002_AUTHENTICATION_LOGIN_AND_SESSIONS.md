# Task 002 — Authentication, Login, Logout, Password Recovery, and Sessions

## Objective
Deliver secure authentication for school staff.

## Scope
- Compare maintained authentication solutions compatible with the selected Next.js version and Neon/ORM choice.
- Document the selected option and why.
- Implement login, logout, password reset, session lifecycle, and protected routes.
- Implement a secure first-run setup that creates the first school administrator.
- Add rate limits and generic password-reset responses.
- Ensure every authenticated request resolves the user's access (scope, branches, permissions) server-side.

## Acceptance criteria
- [ ] Unauthenticated users cannot access protected pages or data endpoints.
- [ ] Login/logout works and session cookies use appropriate secure settings in production.
- [ ] Password reset tokens are single-use, expiring, and not stored in plaintext.
- [ ] Suspended/deactivated users cannot continue using the system.
- [ ] Access scope cannot be set by a forged browser payload.
- [ ] Login and reset rate limits are tested.
- [ ] Secrets never appear in logs or URLs.

## Required tests
Test valid/invalid login, logout, expired session, reset expiry/replay, account deactivation, rate limiting, and direct access to protected endpoints.
