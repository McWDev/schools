# Evidence: Task 002, Authentication, Login, Logout, Password Recovery, and Sessions

Date: 2026-10-14 · Branch: `task/002-authentication`

## What was built
- **Auth design:** in-house. The owner asked for "our own auth". Rationale and the options considered are in [12_AUTHENTICATION.md](../12_AUTHENTICATION.md).
- **Migrations:** `drizzle/0002_auth_sessions.sql` adds the `sessions`, `password_reset_tokens`, and `auth_rate_limits` tables and the password columns on `users`. `drizzle/0003_auth_grants.sql` adds runtime grants, token-hash format checks, and a school-picker RLS policy.
- **Core modules** (`src/server/auth/`): `password` (argon2id), `tokens`, `rate-limit`, `sessions`, `login`, `password-reset`, and `request` (cookies, tenant context per request).
- **Pages:**
  - `/login`, `/forgot-password`, and `/reset-password`, which reads its token from the URL fragment.
  - A protected `/dashboard` placeholder with a school switcher and sign-out.
  - A protected `/api/me` endpoint.
  - `src/proxy.ts`, which redirects visitors who have no session cookie.
- **Platform admin bootstrap:** `npm run auth:bootstrap-admin` creates the admin with no default password and prints a one-time setup link.
- **Email:** a dev outbox mailer writes to `.outbox/`. Production mail is disabled until Task 017.
- **CI:** Playwright end-to-end tests now run after the build.

## Acceptance criteria
- [x] **Unauthenticated users cannot access protected pages or data endpoints.** `/dashboard` redirects to `/login`, `/api/me` returns 401, and a forged cookie is rejected server-side.
- [x] **Login and logout work, with secure cookie settings.** Cookies are `HttpOnly` and `SameSite=Lax`. Over HTTPS the cookie is `__Host-session` and `Secure`. Logout revokes the session row, and a replayed cookie returns 401.
- [x] **Reset tokens are single-use, expiring, and not stored in plaintext.** Only the SHA-256 hash is stored. Tokens last 30 minutes. A conditional update guarantees single use, including when two submissions race.
- [x] **Suspended or deactivated users cannot continue.** Login is refused with the generic error, and existing sessions are rejected on the next request.
- [x] **Tenant context cannot be set by a forged payload.** It is resolved from the session's server-stored school and re-validated against membership on every request. Switching school validates membership and rotates the token.
- [x] **Login and reset rate limits are tested.** Login allows 5 per email and 20 per IP. Reset allows 3 requests per email and 10 submissions per IP.
- [x] **Secrets never appear in logs or URLs.** Reset tokens travel only in the URL fragment, which is stripped from the address bar. Audit metadata is checked to contain no passwords or tokens. Rate-limit keys are hashed.

## Required tests
| Area | Tests |
|---|---|
| Valid/invalid login | valid; email normalization; wrong password and unknown email give the same result; no password set; suspended; deactivated |
| Logout | revokes immediately (integration) and the replayed cookie gets 401 (e2e) |
| Expired session | absolute expiry; idle timeout; garbage, empty, and oversized tokens |
| Reset expiry/replay | expired token; replay; concurrent race; newer request invalidates older; policy failure does not consume the token |
| Account deactivation | login blocked; live session cut off |
| Rate limiting | per-email, per-IP, success clears the counter, hashed keys, reset request and submit limits |
| Direct access | `/dashboard` and `/api/me` without a session; forged cookie |

## Test run
```
npm run test:unit          →  11 passed
npm run test:integration   →  auth.test.ts 27 passed · tenancy.test.ts 26 passed   (Neon test branch)
npm run test:e2e           →  8 passed (Chromium, production build)
npm run lint / typecheck   →  clean
npm run build              →  success; /login, /forgot-password, /reset-password static, /dashboard partially prerendered
npm run check:bundle       →  Client bundle clean (27 files checked)
```
Development branch: migrated (0002, 0003), and the synthetic accounts have the development password.

## Screenshots
- Sign-in error state: `img/task002-login-error.png`
- Dashboard placeholder after sign-in: `img/task002-dashboard.png`
- Forgot password at 390 px mobile width: `img/task002-forgot-mobile.png`
- Sign-in page: `img/task002-login.png`

## Known limitations
- **MFA** for platform super admins is not built yet. It is planned for Task 019 and must ship before production (Task 021).
- **Production email** is disabled until a provider is chosen (Task 017), so password resets only work locally through `.outbox/`.
- **Stale rows** in `auth_rate_limits` and `sessions` are not pruned yet (Task 018).
- **Per-IP rate limits** rely on the host overwriting `X-Forwarded-For`. This is a deployment requirement and is documented.
- **Local test speed:** local e2e and integration runs are slow, about 1.5 and 4 minutes, because of the round trip to Neon in us-east-2. CI uses a local Postgres.
