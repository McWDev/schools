# Evidence: Task 007, Academic Year, Terms, Grades, Classes, and Sections

Date: 2026-10-14 · Branch: `task/007-academic-structure`

## What was built
- **Data model** (`drizzle/0010_academic_structure.sql`, `0011_academic_policies.sql`):
  - `academic_years`: name unique, start before end. At most one is current (partial unique index).
  - `terms`: per year. Name and position are unique within the year. A trigger keeps term dates inside the year.
  - `grade_levels`: name and code unique, with a sort order.
  - `classes`: one per branch, year, and grade.
  - `sections`: name unique per class, optional capacity (≥ 1), and room.
  - Each section carries its class's branch. A composite foreign key (`class_id, branch_id`) guarantees a section can never point to another branch.
  - Every table has `status` (`active` / `archived`) and `updated_at` triggers.
- **Permissions:**
  - New codes: `academics.read`, `academics.configure`, and `classes.manage`.
  - The role templates were re-synced:
    - school admin: all three
    - branch admin and registrar: read and `classes.manage`
    - teacher, finance, and auditor: read only
- **Database enforcement (RLS):**
  - Years, terms, and grade levels are readable by any signed-in user. They are writable only from a school-scope session.
  - Classes and sections are readable and writable only for branches visible to the session (`app.branch_visible`).
  - The application role has **no `DELETE`** on any of these tables.
- **Service** (`src/server/modules/academics/service.ts`):
  - `.strict()` Zod payloads.
  - Constraint violations are translated into field-specific messages (`AcademicConflictError`).
  - Every change is audited (`academic_year.*`, `term.*`, `grade_level.*`, `class.*`, `section.*`), with the branch recorded for class and section events.
- **Rules:**
  - The current year cannot be archived.
  - An archived year cannot become current or receive terms.
  - Changing a year's dates cannot leave its terms outside the year.
  - Archived years and grades, and inactive branches, cannot receive new classes.
  - A class name defaults to its grade's name.
- **UI** (new "Academics" navigation group):
  - **Academic years:** cards with the current badge and terms. A year page has terms, an add-term form, edit, make current, and archive/restore.
  - **Grade levels:** a table plus an add form.
  - **Classes:**
    - filtered by year and by the branch picked in the header
    - cards with sections and seat totals
    - a create-class form
    - a class page with sections, add section, rename, and archive/restore
  - Archiving always asks for confirmation and explains that nothing is deleted.
- **Shared form kit:** `SelectField`, date and number inputs, and `idPrefix` for two forms on one page.
- **Synthetic data:** the 2026-2027 year (current) with three terms, Grades 1–2, and Grade 1 at Main Campus with section A. The test reset also clears the academic tables.

## Acceptance criteria
- [x] **School admins can configure their school's academic structure.** Covered by years, terms, grade levels, the current-year switch, and archive/restore (integration and e2e).
- [x] **Branch users operate only in authorized branches.**
  - A branch admin creates classes and sections in Main and gets `ForbiddenError` for North.
  - Teachers cannot manage classes.
  - North staff see no Main classes, even by ID: "not found" in the UI, and RLS returns no rows.
  - Branch-scope sessions cannot write school-wide structure, even with direct SQL.
- [x] **Duplicate codes and names are handled according to documented scope.** The scope table is in [02_ACCESS_MODEL.md §6](../02_ACCESS_MODEL.md). Each duplicate gets a field-level message: year name, term name and position, grade name and code, class per branch, year, and grade, and section per class. The same grade at another branch is allowed.
- [x] **Historical academic structures are deactivated, not destructively removed.** Records are archived and restored, archived records stay listed, and `DELETE` is refused for the application role on all five tables.

## Test run
- Integration: academics (16) pass on the Neon `test` branch. Access and users suites were updated for the new teacher permission and the new RLS tables. Remote Neon connection resets interrupted one combined run (`ECONNRESET` / `ENOTFOUND`); suites are re-run in CI against a local Postgres.
- End-to-end, local: academics (5) and shell (16, including the axe checks and the viewport checks for the academics pages) all pass.
- CI: see the run for this commit.
