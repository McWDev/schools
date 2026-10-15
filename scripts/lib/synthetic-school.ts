// Synthetic, clearly fake school data for development and tests. Never use real people here.
// Fixed IDs keep tests readable and let the whole seed run as a single round trip.
import type { Client } from "pg";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const SYNTHETIC = {
  branches: { main: id(11), north: id(12) },
  users: {
    /** School administrator, every branch. */
    admin: id(101),
    /** Branch administrator for Main Campus only. */
    mainBranchAdmin: id(102),
    /** Teacher at Main Campus. */
    mainTeacher: id(103),
    /** Teacher at North Campus. */
    northTeacher: id(104),
  },
  /** The current academic year (2026-2027) with three terms. */
  academicYear: id(201),
  terms: { first: id(211), second: id(212), third: id(213) },
  grades: { grade1: id(301), grade2: id(302) },
  /** Grade 1 at Main Campus with section A; North Campus has no classes yet. */
  classes: { mainGrade1: id(401) },
  sections: { mainGrade1A: id(501) },
  /** One student per branch; the student numbers come from the database sequence. */
  students: { mainStudent: id(601), northStudent: id(602) },
  guardians: { mainStudentMother: id(701) },
} as const;

export type SyntheticSchool = typeof SYNTHETIC;

const s = SYNTHETIC;

/** Password given to synthetic users in development and tests. Never used for real accounts. */
export const SYNTHETIC_PASSWORD = "password1234";

/**
 * Inserts the example school's branches and staff. The school profile row and the system roles
 * already exist (created by migrations); roles are assigned by key.
 */
export const SYNTHETIC_SCHOOL_SQL = `
UPDATE school_settings SET name = 'Example Academy', short_name = 'EA', timezone = 'UTC',
  email = NULL, phone = NULL, address = NULL, logo_key = NULL WHERE id = 1;
INSERT INTO branches (id, name, code, area) VALUES
  ('${s.branches.main}', 'Main Campus', 'MAIN', 'Central'),
  ('${s.branches.north}', 'North Campus', 'NORTH', 'North');
INSERT INTO users (id, email, display_name, status, access_scope) VALUES
  ('${s.users.admin}', 'admin@example.test', 'School Admin', 'active', 'school'),
  ('${s.users.mainBranchAdmin}', 'main.admin@example.test', 'Main Branch Admin', 'active', 'branch'),
  ('${s.users.mainTeacher}', 'main.teacher@example.test', 'Main Teacher', 'active', 'branch'),
  ('${s.users.northTeacher}', 'north.teacher@example.test', 'North Teacher', 'active', 'branch');
INSERT INTO user_branches (user_id, branch_id) VALUES
  ('${s.users.mainBranchAdmin}', '${s.branches.main}'),
  ('${s.users.mainTeacher}', '${s.branches.main}'),
  ('${s.users.northTeacher}', '${s.branches.north}');
INSERT INTO user_roles (user_id, role_id)
SELECT a.user_id::uuid, r.id
FROM (VALUES
  ('${s.users.admin}', 'school_admin'),
  ('${s.users.mainBranchAdmin}', 'branch_admin'),
  ('${s.users.mainTeacher}', 'teacher'),
  ('${s.users.northTeacher}', 'teacher')
) AS a(user_id, role_key)
JOIN roles r ON r.key = a.role_key;
INSERT INTO academic_years (id, name, starts_on, ends_on, is_current) VALUES
  ('${s.academicYear}', '2026-2027', '2026-09-01', '2027-06-30', true);
INSERT INTO terms (id, academic_year_id, name, sequence, starts_on, ends_on) VALUES
  ('${s.terms.first}', '${s.academicYear}', 'Term 1', 1, '2026-09-01', '2026-12-18'),
  ('${s.terms.second}', '${s.academicYear}', 'Term 2', 2, '2027-01-05', '2027-03-26'),
  ('${s.terms.third}', '${s.academicYear}', 'Term 3', 3, '2027-04-06', '2027-06-30');
INSERT INTO grade_levels (id, name, code, sort_order) VALUES
  ('${s.grades.grade1}', 'Grade 1', 'G1', 1),
  ('${s.grades.grade2}', 'Grade 2', 'G2', 2);
INSERT INTO classes (id, branch_id, academic_year_id, grade_level_id, name) VALUES
  ('${s.classes.mainGrade1}', '${s.branches.main}', '${s.academicYear}', '${s.grades.grade1}', 'Grade 1');
INSERT INTO sections (id, class_id, branch_id, name, capacity, room) VALUES
  ('${s.sections.mainGrade1A}', '${s.classes.mainGrade1}', '${s.branches.main}', 'A', 40, 'Room 101');
INSERT INTO students (id, branch_id, section_id, first_name, last_name, date_of_birth, gender,
  admission_date, address, medical_notes) VALUES
  ('${s.students.mainStudent}', '${s.branches.main}', '${s.sections.mainGrade1A}', 'Amina', 'Example',
    '2019-03-14', 'female', '2026-09-01', '12 Example Street', 'Example allergy note'),
  ('${s.students.northStudent}', '${s.branches.north}', NULL, 'Yusuf', 'Sample',
    '2018-11-02', 'male', '2026-09-01', NULL, NULL);
INSERT INTO student_guardians (id, student_id, branch_id, full_name, relationship, phone, email,
  is_primary) VALUES
  ('${s.guardians.mainStudentMother}', '${s.students.mainStudent}', '${s.branches.main}',
    'Hodan Example', 'Mother', '+252 61 000 0001', 'hodan.parent@example.test', true);
`;

/**
 * Clears all people, branches, academic structure, sessions, and history; keeps roles,
 * permissions, and the profile row.
 */
export const RESET_SCHOOL_DATA_SQL = `
TRUNCATE auth_rate_limits, password_reset_tokens, sessions, audit_events, user_invitations,
  user_roles, user_branches, student_transfers, student_guardians, students, sections, classes,
  terms, academic_years, grade_levels, users, branches CASCADE;
SELECT setval('student_number_seq', 1, false);
`;

export async function insertSyntheticSchool(client: Client): Promise<SyntheticSchool> {
  await client.query(SYNTHETIC_SCHOOL_SQL);
  return SYNTHETIC;
}
