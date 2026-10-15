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
`;

/** Clears all people, branches, sessions, and history; keeps roles, permissions, and the profile row. */
export const RESET_SCHOOL_DATA_SQL = `
TRUNCATE auth_rate_limits, password_reset_tokens, sessions, audit_events, user_invitations,
  user_roles, user_branches, users, branches CASCADE;
`;

export async function insertSyntheticSchool(client: Client): Promise<SyntheticSchool> {
  await client.query(SYNTHETIC_SCHOOL_SQL);
  return SYNTHETIC;
}
