@AGENTS.md

# Project rules

- Specs live in `docs/`. Build tasks strictly in order from `docs/TASKS/`; track status in `docs/PROGRESS.md` and evidence in `docs/evidence/`.
- Each task gate requires owner review before the next task begins.
- Database: Neon project `schools` (`wandering-union-14776988`). Use the `development` branch for local work; never run destructive SQL against `production`.
- Run `npm run check` before declaring a task complete.
