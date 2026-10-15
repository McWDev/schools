/**
 * Permission codes. Must match the rows inserted by migrations (checked by an integration
 * test). Grant permissions through roles; never check role names in code.
 */
export const PERMISSIONS = [
  "school.settings.manage",
  "branches.read",
  "branches.manage",
  "users.read",
  "users.invite",
  "users.update",
  "users.deactivate",
  "users.assign_roles",
  "audit.read",
  "academics.read",
  "academics.configure",
  "classes.manage",
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];
