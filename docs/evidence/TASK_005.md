# Evidence: Task 005, School Profile and Settings

Date: 2026-10-14 · Branch: `task/005-school-settings`

## What was built
- **School settings page** (`/dashboard/settings`), with an "Administration → School settings" navigation item for `school.settings.manage`. It covers:
  - name and short name
  - timezone, chosen from the server's IANA list
  - school email, phone, and main address
- **School logo:** upload, replace, and remove.
  - The image is decoded by `sharp`, so disguised files are rejected. It keeps its aspect ratio and transparency, is fitted within 512 px without enlarging, and is re-encoded to WebP.
  - It is stored under a generated key (`school/logo-<random>.webp`).
  - It is served publicly by `/api/school/logo` with `nosniff` and a locked-down CSP. The logo contains no personal data and must show before sign-in.
  - Its URL is versioned by the profile's update time, so a change shows immediately despite caching.
- **Where the profile appears:**
  - **Sign-in page left panel** (redesigned at the owner's request): a large, clearly visible logo on a white tile; the school name from settings beneath it (e.g. "Wadajir Primary & Secondary School"); and a single welcoming line.
  - **Sidebar brand:** the logo, or the school's initials when no logo is set.
  - **Dashboard:** dates and times use the school's timezone.
- **Audit:** `school.settings.update` records the names of changed fields only, never their values. Saving without changes records nothing.
- **Migration** `0009_school_logo.sql` adds `school_settings.logo_key`.
- **Shared image validation** between profile photos and logos (`processAvatar` / `processLogo`).

## Acceptance criteria
- [x] **Only `school.settings.manage` can change settings, checked server-side.** Branch admins and teachers get `ForbiddenError` from the service and a no-access page.
- [x] **Bad input is rejected:** invalid timezones, bad emails, oversized or disguised logos, and unexpected fields (`id`, `logoKey`, `locale`).
- [x] **Logos are validated, re-encoded, and served through a dedicated route.**
- [x] **Every change creates an audit event** (`school.settings.update` with changed field names).
- [x] **Dashboard times use the school timezone.**

## Tests
| Layer | Tests |
|---|---|
| Unit | `processLogo`: aspect ratio and transparency kept, no enlarging, disguised SVG rejected; navigation shows Settings only to administrators |
| Integration (`settings.test.ts`, 7) | update and audit (field names only); no-op saves are not audited; empty optional fields become null; branch admin and teacher denied; invalid timezone, email, and forged fields rejected; logo store/replace/remove deletes old files; disguised logo and non-admin upload rejected |
| E2E (`settings.spec.ts`, 4) | rename and timezone change show in the sidebar and on sign-in; field-level validation errors; logo upload shows on the sign-in page and a disguised file is rejected; teacher and branch admin have no link and no access |

## Screenshots
- Sign-in page with the school name from settings: `img/t005-login-light.png`, `img/t005-login-dark.png`

## Notes
- The development database's school is renamed "Wadajir Primary & Secondary School" to demonstrate the panel. Change it any time in School settings.

- CI passed: https://github.com/McWDev/schools/actions/runs/38677022413 (after the build-time route fix in 350b709)
