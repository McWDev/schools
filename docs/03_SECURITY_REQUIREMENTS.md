# Security Requirements and Threat Controls

## 1. Security principles
- Deny by default; least privilege.
- Enforce authorization on the server for every request.
- Treat all browser input as untrusted.
- Separate authentication (who you are) from authorization (what you can do).
- Protect branch boundaries and role permissions as a top-priority requirement.
- Log sensitive administrative events without logging secrets or unnecessary personal data.

## 2. Authentication and sessions
- Use a maintained authentication library/provider rather than implementing cryptography from scratch.
- Store password hashes using a modern password-hashing algorithm supported by the chosen library; never store plaintext or reversibly encrypted passwords.
- Rate-limit login, password reset, invitation acceptance, and other sensitive endpoints.
- Use secure, HttpOnly, SameSite cookies and HTTPS in production.
- Rotate session identifiers after login and privilege changes; revoke sessions after password reset, account suspension, or role removal where feasible.
- Password-reset tokens must be random, hashed at rest, short-lived, single-use, and not reveal whether an email/account exists.
- Require re-authentication for high-risk actions.
- Enforce MFA for school administrators before production; strongly recommend MFA for finance approvers.
- Never place access tokens, passwords, or session secrets in URLs or logs.

## 3. Authorization and branch isolation
- Check the user's active status, branch scope, and permissions for each read and write.
- Scope database queries before retrieving rows; do not fetch a row globally and rely on the UI to hide it.
- Validate every `branch_id` against the user's scope.
- Prevent insecure direct object reference (IDOR) attacks by testing guessed and modified IDs.
- Ensure background jobs, scheduled reports, exports, file downloads, and notifications use the same authorization rules.
- Use deny-by-default handling when the access context is missing or invalid.
- Audit permission changes and privileged support access.

## 4. Input and application security
- Validate inputs with schemas on the server.
- Use parameterized queries/ORM-safe query APIs; never concatenate untrusted values into SQL.
- Protect state-changing requests against CSRF according to the chosen authentication architecture.
- Use framework protections and a strict Content Security Policy where compatible.
- Escape output and avoid unsafe HTML rendering.
- Keep dependencies updated; review vulnerability advisories.
- Apply request size limits and rate limits.
- Avoid leaking stack traces, SQL errors, internal IDs, or secrets to end users.

## 5. File uploads and profile photos
- Allow only a small documented list of image formats; validate actual file content, not only filename/MIME header.
- Enforce size and image-dimension limits.
- Generate storage names; never trust user-supplied filenames as paths.
- Store uploads in private object storage or a controlled private bucket, not an executable public directory.
- Serve files through authorized URLs or short-lived signed URLs.
- Consider image re-encoding and malware scanning where appropriate.
- Do not permit HTML, SVG, scripts, or executable uploads as profile photos unless a reviewed sanitization design explicitly supports them.

## 6. Secrets and database
- Keep Neon connection strings and auth secrets in environment variables/managed secrets.
- Never commit `.env` files or credentials.
- Use separate development, staging, and production databases.
- Restrict database roles and rotate secrets after exposure.
- Use TLS for database connections.
- Use reviewed schema migrations; production schema changes must be reversible or have a documented recovery plan.

## 7. Audit logs
Record at minimum:
- Login success/failure events at a privacy-appropriate level.
- User invitation, activation, deactivation, and role/permission changes.
- School and branch creation, suspension, and configuration changes.
- Student record changes, attendance corrections, marks approvals/changes, finance transactions, exports, and exceptional support access.
Each event should include actor, action, timestamp, branch where relevant, record reference, outcome, and safe metadata. Do not record passwords, reset tokens, session cookies, full payment credentials, or unnecessary sensitive content.
Audit logs should be append-only to ordinary application roles. Restrict access and define retention.

## 8. Privacy and data governance
- Define data retention, deletion, export, consent, and breach-response policies for the countries where the product operates.
- Collect only data needed for school operations.
- Restrict student and guardian information to authorized roles.
- Document how account closure, student graduation, and branch closure affect data.
- Backups must be protected with access controls and encryption provided by the storage platform.

## 9. Security verification checklist
- Cross-branch read/write tests for every branch-scoped resource.
- Cross-branch access tests for branch-limited users.
- Role escalation and forged payload tests.
- Session revocation tests.
- Password-reset replay/expiry tests.
- Rate-limit tests.
- Upload type/size/path tests.
- Export/download authorization tests.
- Audit-log tampering tests.
- Dependency and static analysis checks.
- Backup restore and incident response rehearsal.
