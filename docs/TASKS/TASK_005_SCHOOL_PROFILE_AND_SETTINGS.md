# Task 005 — School Profile and Settings

## Objective
Let the school administrator manage the school's profile and system-wide settings.

## Scope
- School profile: name, short name, logo, contact details, address, and timezone/locale, all edited in Settings.
- First-run setup (`npm run setup`) is already built; document it in the handover guide.
- The school name and logo are shown on sign-in pages, the app shell, emails, and later on printed documents.
- Display all dates and times in the school's configured timezone.
- Log profile and settings changes.

## Acceptance criteria
- [ ] Only users with `school.settings.manage` can change settings (checked server-side).
- [ ] Invalid timezones, oversized logos, and unexpected fields are rejected.
- [ ] Logos are validated and re-encoded like profile photos and served through an authorized route.
- [ ] Every change creates an audit event (`school.settings.update`).
- [ ] Times on dashboards and lists use the school timezone.
