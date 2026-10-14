@AGENTS.md

# Project rules

- This is a single-school system: one installation = one school with many branches. Do not reintroduce multi-tenant/SaaS concepts (school_id, tenants, platform admin, plans, billing).
- Specs live in `docs/`. Build tasks strictly in order from `docs/TASKS/`; track status in `docs/PROGRESS.md` and evidence in `docs/evidence/`.
- Each task gate requires owner review before the next task begins.
- Every branch-scoped table carries `branch_id`, is filtered by the user's access scope, and has RLS (see `docs/11_ACCESS_CONTROL_IMPLEMENTATION.md`).
- Database: Neon project `schools` (`wandering-union-14776988`). Use the `development` branch for local work; never run destructive SQL against `production`.
- Run `npm run check` before declaring a task complete.
