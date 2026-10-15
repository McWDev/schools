# Evidence: Task 008, Student Admissions and Records

Date: 2026-10-15 · Branch: `task/008-student-admissions`

## What was built
- **Data model** (`drizzle/0012`–`0014`):
  - `students`: branch, optional section placement, names, date of birth, gender, admission date, status, previous school, phone, address, medical notes, and photo.
  - `student_guardians`: guardians of a student.
  - `student_transfers`: transfer history, append-only.
  - Composite keys keep a student's section on the student's own branch, and keep guardians on the same branch as their student. Guardians follow the student automatically on transfer (`ON UPDATE CASCADE`).
- **Student numbers:** issued by the database from a sequence (`2026-00001`), unique across the school, and impossible to change (trigger).
- **Permissions:** `students.read`, `students.read_sensitive`, `students.create`, `students.update`, and `students.transfer`, added to the role templates.
- **RLS on all three tables.** The application role has no `DELETE`. Transfers can only be inserted when both branches are visible to the session.
- **Service** (`src/server/modules/students/service.ts`):
  - admission with a primary guardian and an optional photo
  - edits, placement, status, extra guardians, and transfers
  - search by name or number
  - duplicate check
  - photo replace and remove
  - Every change is audited without personal data in the metadata.
- **UI** ("People → Students"):
  - **List:** photo thumbnails, search, status filter, and the branch picked in the header.
  - **Admission form:** student, enrolment, primary guardian, and photo. A possible duplicate shows a warning with a confirmation checkbox.
  - **Student profile:** photo, record, guardians, and transfer history. For permitted staff, it also has edit, photo upload and remove, placement, status, add guardian, and transfer.
- **Photo and phone** were added at the owner's request during this task.
  - Photo: optional on admission and changeable later. JPEG, PNG, or WebP up to 2 MB, decoded and re-encoded with `sharp`, and served by an authorized route.
  - Student phone: treated as sensitive, like the address.
- **Synthetic data:** Amina Example (Main, Grade 1 A, with a guardian) and Yusuf Sample (North).

## Acceptance criteria
- [x] **Student records are branch-scoped.** Teachers list only their branch. Another branch's student returns "not found" in the UI and 404 for the photo, and RLS returns no rows even for direct queries.
- [x] **Student number uniqueness is enforced at database level within the agreed scope (whole school).** There is a unique constraint plus an immutability trigger, and both are tested.
- [x] **Required fields are validated server-side.** `.strict()` Zod schemas cover names, date of birth before admission, gender, branch, and guardian. Forged keys such as `status` are rejected.
- [x] **Sensitive fields are visible only to authorized roles.** Phone, address, medical notes, and guardian contacts are neither selected nor accepted without `students.read_sensitive`. Tested in integration and e2e.
- [x] **Branch transfers preserve history and are audited.** A transfer history row is written with both branches, date, reason, and actor. Guardians move with the student, the placement ends, and a `student.transfer` audit event is recorded. Branch staff cannot transfer outside their scope (service and RLS).
- [x] **Create, edit, and status changes are audited.** Events: `student.admit`, `student.update` (field names only), `student.place`, `student.status`, `student.guardian_add`, `student.photo_update`, and `student.photo_remove`.

## Deferred
- Document uploads (birth certificates, transfer letters) are not part of this task's acceptance criteria. They can reuse the same storage and validation pattern later.

## Test run
- Integration: students (18) pass on the Neon `test` branch.
- End-to-end, local: students (5) and shell (16, including axe checks for the student pages) pass.
- Found during this task: after a form action returned an error or a warning, React reset drop-downs to their first option, which lost choices like gender. `SelectField` now remounts when its value changes, so submitted choices stay selected in every form.
- One academics test timed out on a remote Neon reset during a local run. It is unrelated to the change and passed earlier. CI runs on its own Postgres.
