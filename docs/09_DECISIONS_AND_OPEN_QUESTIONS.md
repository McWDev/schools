# Decisions and Open Questions

## Recommended defaults
- Multi-tenant model: shared Neon PostgreSQL database with strict tenant scoping and database defense in depth.
- Framework: Next.js App Router with TypeScript on Node.js runtime.
- Database: Neon PostgreSQL.
- UI: responsive accessible design system; finalize component library in Task 000.
- Auth: maintained authentication library; select in Task 002 after compatibility/security review.
- Tenant creation: controlled onboarding, not unrestricted public signup.
- Branch access: school-wide admin sees all branches in their school; branch users see only assigned branches.
- Data deletion: preserve historical academic, financial, and audit records; use deactivation and defined retention policies.
- Build workflow: one task at a time; test and review before the next task.

## Decisions requiring owner input before relevant modules
1. Country/legal jurisdiction and privacy requirements.
2. Supported languages (English only, Somali only, or multilingual).
3. Currency, timezone defaults, academic calendar, and grading conventions.
4. School plans: number of branches, students, staff, storage, and feature limits.
5. Subscription payments: launch with manual invoicing or payment provider integration.
6. Email/SMS/WhatsApp providers and budget.
7. Student and parent portal availability for MVP.
8. Attendance rules (daily, period-based, or both).
9. Grading rules, resits, report card formats, and promotion rules.
10. Fees: discounts, waivers, arrears, receipts, and payment methods.
11. Required exports and local reporting formats.
12. Data retention periods and tenant closure/export process.

## Decision rule
Do not block low-risk early tasks on decisions that can be safely deferred. Record assumptions and revisit them before the relevant module. Never guess a legal, financial, or grading rule that affects real records.
