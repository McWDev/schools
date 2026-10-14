# Evidence: Task 000, Repository, Tooling, and Environment Baseline

Date: 2026-10-14

## Environment
- Node.js v24.21.0, npm 11.19.0, Git 2.56.0 (Windows 11).
- Next.js 16.4.0, React 19.3.0, TypeScript 5 (strict), Tailwind CSS 4.
- Neon project `schools` (`wandering-union-14776988`), Postgres 18, us-east-2.
  - Created branch `development` (`br-floral-heart-b5toy5hh`) for local work.
  - The `production` branch (`br-mute-fire-b526i1rc`) is untouched and empty.

## Acceptance criteria
- [x] App starts locally with `npm run dev`. Verified on port 3217 that `GET /` returns 200 with the title "School Management SaaS".
- [x] TypeScript check passes (`npm run typecheck`).
- [x] Lint passes with zero warnings (`npm run lint`).
- [x] Production build passes (`npm run build`). Routes: `/` and `/_not-found` (static).
- [x] `.env*` files are gitignored; `.env.example` holds placeholders only.
- [x] No real credentials are committed. `.env.local` holds the dev connection string and is ignored.

## Additional checks
- Unit tests: 4/4 pass (`src/lib/env-schema.test.ts`). They cover a missing or malformed `DATABASE_URL` failing closed and secrets never appearing in error messages.
- Security headers verified on the dev server: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Strict-Transport-Security`. `X-Powered-By` is removed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- CI workflow `.github/workflows/ci.yml` added. It runs the same commands as `npm run check`.

## Known limitations
- `npm audit` (including dev dependencies) reports 5 high-severity findings in `braces`, pulled in by `eslint-config-next` through `fast-glob`. They affect lint time only and are not shipped. npm's suggested fix downgrades to Next 14 tooling, so it is not applied. Revisit when `eslint-config-next` updates.
- CI has not run on GitHub yet because no remote repository is configured.
- There is no content security policy yet. It will be added with authentication (Task 002), once script and style sources are known.
- No screenshot was captured. Run `npm run dev` and open http://localhost:3217 to view the placeholder page.
