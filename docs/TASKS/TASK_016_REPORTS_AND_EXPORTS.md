# Task 016 — Reports, Dashboards, and Exports

## Objective
Provide accurate, permission-aware reports.

## Scope
Student counts, attendance, academic performance, staff, fee balances, branch comparisons, date filters, CSV/XLSX/PDF exports as approved, and export audit records.

## Acceptance criteria
- [ ] Reports use the same authorization rules as interactive pages.
- [ ] Exports cannot be used to exfiltrate another school's or branch's data.
- [ ] Large exports are queued or streamed safely with limits.
- [ ] Download permissions are separate from viewing permissions where needed.
- [ ] Export events are audited.
