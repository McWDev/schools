// Synthetic, clearly fake tenants for development and tests. Never use real school data here.
// Fixed IDs keep tests readable and let the whole seed run as a single round trip.
import type { Client } from "pg";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const SYNTHETIC = {
  schoolA: { id: id(1), branchA1: id(11), branchA2: id(12) },
  schoolB: { id: id(2), branchB1: id(21) },
  users: {
    adminA: id(101),
    teacherA1: id(102),
    adminB: id(103),
    multiSchool: id(104),
    branchAdminA1: id(105),
  },
  memberships: {
    adminA: id(201),
    teacherA1: id(202),
    adminB: id(203),
    multiA: id(204),
    multiB: id(205),
    branchAdminA1: id(206),
  },
} as const;

export type SyntheticTenants = typeof SYNTHETIC;

const s = SYNTHETIC;

/**
 * Idempotent additions keyed by email and school slug, so they also upgrade an older
 * development seed: the branch admin account and every synthetic role assignment.
 */
export const SYNTHETIC_ACCESS_SQL = `
INSERT INTO users (id, email, display_name, status)
VALUES ('${s.users.branchAdminA1}', 'branch.admin.a1@example.test', 'Branch Admin A1', 'active')
ON CONFLICT (email) DO NOTHING;
INSERT INTO school_memberships (school_id, user_id, scope)
SELECT sc.id, u.id, 'branch' FROM schools sc, users u
WHERE sc.slug = 'example-academy-a' AND u.email = 'branch.admin.a1@example.test'
ON CONFLICT (school_id, user_id) DO NOTHING;
INSERT INTO membership_branches (school_id, membership_id, branch_id)
SELECT m.school_id, m.id, b.id
FROM school_memberships m
JOIN users u ON u.id = m.user_id
JOIN branches b ON b.school_id = m.school_id AND b.code = 'A-MAIN'
WHERE u.email = 'branch.admin.a1@example.test'
ON CONFLICT DO NOTHING;
INSERT INTO membership_roles (school_id, membership_id, role_id)
SELECT m.school_id, m.id, r.id
FROM (VALUES
  ('admin.a@example.test', 'example-academy-a', 'school_admin'),
  ('teacher.a1@example.test', 'example-academy-a', 'teacher'),
  ('branch.admin.a1@example.test', 'example-academy-a', 'branch_admin'),
  ('admin.b@example.test', 'example-academy-b', 'school_admin'),
  ('multi@example.test', 'example-academy-a', 'school_admin'),
  ('multi@example.test', 'example-academy-b', 'school_admin')
) AS a(email, slug, role_key)
JOIN users u ON u.email = a.email
JOIN schools sc ON sc.slug = a.slug
JOIN school_memberships m ON m.user_id = u.id AND m.school_id = sc.id
JOIN roles r ON r.school_id = sc.id AND r.key = a.role_key
ON CONFLICT DO NOTHING;
`;

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
  ('${s.users.multiSchool}', 'multi@example.test', 'Multi School User', 'active'),
  ('${s.users.branchAdminA1}', 'branch.admin.a1@example.test', 'Branch Admin A1', 'active');
INSERT INTO school_memberships (id, school_id, user_id, scope) VALUES
  ('${s.memberships.adminA}', '${s.schoolA.id}', '${s.users.adminA}', 'school'),
  ('${s.memberships.teacherA1}', '${s.schoolA.id}', '${s.users.teacherA1}', 'branch'),
  ('${s.memberships.adminB}', '${s.schoolB.id}', '${s.users.adminB}', 'school'),
  ('${s.memberships.multiA}', '${s.schoolA.id}', '${s.users.multiSchool}', 'school'),
  ('${s.memberships.multiB}', '${s.schoolB.id}', '${s.users.multiSchool}', 'school'),
  ('${s.memberships.branchAdminA1}', '${s.schoolA.id}', '${s.users.branchAdminA1}', 'branch');
INSERT INTO membership_branches (school_id, membership_id, branch_id) VALUES
  ('${s.schoolA.id}', '${s.memberships.teacherA1}', '${s.schoolA.branchA1}');
${SYNTHETIC_ACCESS_SQL}
`;

/** Inserts School A (2 branches) and School B (1 branch) with users at each scope. */
export async function insertSyntheticTenants(client: Client): Promise<SyntheticTenants> {
  await client.query(SYNTHETIC_TENANTS_SQL);
  return SYNTHETIC;
}

/** Password given to synthetic users in development and tests. Never used for real accounts. */
export const SYNTHETIC_PASSWORD = "password1234";
