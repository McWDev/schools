// Synthetic, clearly fake tenants for development and tests. Never use real school data here.
// Fixed IDs keep tests readable and let the whole seed run as a single round trip.
import type { Client } from "pg";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const SYNTHETIC = {
  schoolA: { id: id(1), branchA1: id(11), branchA2: id(12) },
  schoolB: { id: id(2), branchB1: id(21) },
  users: { adminA: id(101), teacherA1: id(102), adminB: id(103), multiSchool: id(104) },
  memberships: {
    adminA: id(201),
    teacherA1: id(202),
    adminB: id(203),
    multiA: id(204),
    multiB: id(205),
  },
} as const;

export type SyntheticTenants = typeof SYNTHETIC;

const s = SYNTHETIC;

export const SYNTHETIC_TENANTS_SQL = `
INSERT INTO schools (id, name, slug, status) VALUES
  ('${s.schoolA.id}', 'Example Academy A', 'example-academy-a', 'active'),
  ('${s.schoolB.id}', 'Example Academy B', 'example-academy-b', 'active');
INSERT INTO branches (id, school_id, name, code) VALUES
  ('${s.schoolA.branchA1}', '${s.schoolA.id}', 'A Main Campus', 'A-MAIN'),
  ('${s.schoolA.branchA2}', '${s.schoolA.id}', 'A North Campus', 'A-NORTH'),
  ('${s.schoolB.branchB1}', '${s.schoolB.id}', 'B Main Campus', 'B-MAIN');
INSERT INTO users (id, email, display_name, status) VALUES
  ('${s.users.adminA}', 'admin.a@example.test', 'Admin A', 'active'),
  ('${s.users.teacherA1}', 'teacher.a1@example.test', 'Teacher A1', 'active'),
  ('${s.users.adminB}', 'admin.b@example.test', 'Admin B', 'active'),
  ('${s.users.multiSchool}', 'multi@example.test', 'Multi School User', 'active');
INSERT INTO school_memberships (id, school_id, user_id, scope) VALUES
  ('${s.memberships.adminA}', '${s.schoolA.id}', '${s.users.adminA}', 'school'),
  ('${s.memberships.teacherA1}', '${s.schoolA.id}', '${s.users.teacherA1}', 'branch'),
  ('${s.memberships.adminB}', '${s.schoolB.id}', '${s.users.adminB}', 'school'),
  ('${s.memberships.multiA}', '${s.schoolA.id}', '${s.users.multiSchool}', 'school'),
  ('${s.memberships.multiB}', '${s.schoolB.id}', '${s.users.multiSchool}', 'school');
INSERT INTO membership_branches (school_id, membership_id, branch_id) VALUES
  ('${s.schoolA.id}', '${s.memberships.teacherA1}', '${s.schoolA.branchA1}');
`;

/** Inserts School A (2 branches) and School B (1 branch) with users at each scope. */
export async function insertSyntheticTenants(client: Client): Promise<SyntheticTenants> {
  await client.query(SYNTHETIC_TENANTS_SQL);
  return SYNTHETIC;
}

/** Password given to synthetic users in end-to-end tests. Test databases only. */
export const SYNTHETIC_PASSWORD = "correct horse battery staple";
