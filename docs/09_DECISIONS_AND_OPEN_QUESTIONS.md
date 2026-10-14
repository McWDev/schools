# Decisions and Open Questions

## Decisions made
| Date | Decision |
|---|---|
| 2026-10-14 | **Single-school system (redesign R1).** One installation serves exactly one school with many branches in different areas. The multi-school SaaS model (tenants, platform admin, plans, billing) was removed. Another school gets its own separate installation and database. |
| 2026-10-14 | **Framework:** Next.js 16 App Router + TypeScript on Node.js 24. |
| 2026-10-14 | **Database:** Neon PostgreSQL with Drizzle ORM. RLS is defense in depth. |
| 2026-10-14 | **Authentication:** in-house sessions on maintained primitives (argon2id, hashed tokens), as requested by the owner. |
| 2026-10-14 | **No public sign-up:** the first administrator comes from `npm run setup`; all other staff are invited. |
| 2026-10-14 | **Branch access:** school-wide staff see all branches; branch staff see only assigned branches. |
| 2026-10-14 | **Data deletion:** historical academic, financial, and audit records are preserved; accounts and branches are deactivated, not deleted. |
| 2026-10-14 | **Workflow:** one task at a time, tested in CI and reviewed before the next task. |

## Decisions requiring owner input before relevant modules
1. Country/legal jurisdiction and privacy requirements.
2. Supported languages (English only, Somali only, or multilingual).
3. Currency, timezone default, academic calendar, and grading conventions.
4. Email/SMS/WhatsApp providers and budget.
5. Student and parent portal availability for the MVP.
6. Attendance rules (daily, period-based, or both).
7. Grading rules, resits, report card formats, and promotion rules.
8. Fees: discounts, waivers, arrears, receipts, and payment methods.
9. Required exports and local reporting formats.
10. Data retention periods and the record closure/export process.

## Decision rule
Do not block low-risk early tasks on decisions that can be safely deferred. Record assumptions and revisit them before the relevant module. Never guess a legal, financial, or grading rule that affects real records.
