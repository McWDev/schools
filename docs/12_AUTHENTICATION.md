# Authentication (decided in Task 002)

## Decision: in-house sessions built on maintained primitives
The owner asked for the project's own authentication rather than a hosted provider. We
implement session management ourselves and rely on maintained libraries for all cryptography:

| Concern | Implementation |
|---|---|
| Password hashing | `@node-rs/argon2`, **argon2id** with m = 19 MiB, t = 2, p = 1 (OWASP baseline). Never implemented by hand. |
| Random tokens | Node `crypto.randomBytes(32)`: 256-bit, base64url. |
| Token storage | Only `SHA-256(token)` is stored, for sessions and reset tokens alike. A database leak exposes no usable token. |
| Sessions | Server-side rows in `sessions`, validated against the database on **every** request. |
| Rate limiting | Postgres fixed-window counters in `auth_rate_limits`, shared by every app instance. Keys are hashed, so no raw emails or IPs are stored. |

Options considered:
- **Auth.js.** Its credentials provider is discouraged by its own docs, and JWT sessions cannot be revoked immediately.
- **Better Auth.** Capable, but it brings its own user and session schema, which we would have to reconcile with our UUID tables, tenancy, and RLS model.
- **Hosted providers (Clerk, Neon Auth).** Identity data would move to a third party, at a per-user cost.

The in-house design keeps identity, sessions, and audit in our own database under our tenancy rules. Hosted SSO can be added later as an extra sign-in method.

## Policies (`src/server/auth/config.ts`)
| Policy | Value |
|---|---|
| Session absolute lifetime | 7 days |
| Session idle timeout | 12 hours (last-seen updated at most every 5 minutes) |
| Password | 12–128 characters, no composition rules (NIST SP 800-63B) |
| Reset token | 30 minutes, single use; a new request invalidates older links |
| Login limits | 5 per email and 20 per IP, per 15 minutes |
| Reset limits | 3 requests per email and 10 per IP per hour; 10 submissions per IP per 15 minutes |

## Security properties
- **Cookies.** `HttpOnly` and `SameSite=Lax`. Over HTTPS the cookie is named `__Host-session` with `Secure`, `Path=/`, and no `Domain`. It holds only the random token.
- **CSRF.** Every state change is a Server Action (POST only). Next.js rejects actions whose `Origin` doesn't match the host, and SameSite cookies block cross-site sends.
- **No enumeration.** Unknown email, wrong password, and inactive account all return "The email or password is incorrect." A dummy argon2 verification equalizes timing. The forgot-password response is identical for every email, and the work runs in `after()`, so timing doesn't reveal account existence either.
- **No secrets in URLs or logs.** The reset link carries its token in the URL fragment (`/reset-password#token=…`). Browsers never send fragments to servers, and the page strips the fragment from the address bar immediately. Audit metadata never includes passwords, tokens, or emails.
- **Revocation.**
  - Logout revokes the session row.
  - A password reset revokes all of the user's sessions.
  - Suspending or deactivating a user invalidates their sessions on the next request.
- **Access context.** The user's scope, branches, and permissions are resolved server-side from the session on every request (`getRequestAccess`). The browser never supplies a trusted scope or branch; a selected branch filter is stored on the session and re-validated each time.
- **Proxy.** `src/proxy.ts` only redirects requests that have no cookie. All real checks happen in server code.

## First school administrator (first-run setup)
```bash
npm run setup -- --school "Falkaab School" --email admin@yourdomain --name "Head Teacher" --timezone Africa/Mogadishu
```
This names the school, creates the first school administrator without a password, and prints a single-use setup link (`/accept-invitation`), valid for 60 minutes, exactly once. It refuses to run if a school administrator already exists. There is no default password anywhere.

## Deployment requirements
- `APP_URL` must be the public `https://` origin. This enables Secure / `__Host-` cookies.
- The hosting platform must set `X-Forwarded-For` itself (Vercel and most managed hosts do). Otherwise per-IP rate limits can be bypassed by spoofing the header.
- `EMAIL_TRANSPORT` defaults to `disabled` in production until a provider is configured (Task 017). Password-reset emails cannot be sent before then.

## Follow-ups
- **MFA** is required for school administrators before production. It is planned with system administration (Task 019) and must ship before Task 021.
- Expired rate-limit and session rows should be pruned by a scheduled job (Task 018).
- Re-authentication for high-risk actions is in place for role, access, and status changes (Task 003).
