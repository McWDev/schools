// Table definitions only — no secrets or connection logic, so drizzle-kit can load this file
// directly. Row-level security, roles, grants, and triggers live in hand-written migrations.
//
// One installation serves exactly one school. The school has many branches (campuses in
// different areas); staff work either school-wide or in assigned branches.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const branchStatus = pgEnum("branch_status", ["active", "inactive"]);
export const userStatus = pgEnum("user_status", ["invited", "active", "suspended", "deactivated"]);
/** "school": every branch. "branch": only the branches listed in user_branches. */
export const accessScope = pgEnum("access_scope", ["school", "branch"]);
export const auditOutcome = pgEnum("audit_outcome", ["success", "denied", "failure"]);

/** The school's profile. Exactly one row (id = 1), created by migrations and edited in Settings. */
export const schoolSettings = pgTable(
  "school_settings",
  {
    id: smallint("id").primaryKey().default(1),
    name: text("name").notNull(),
    shortName: text("short_name"),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    /** Generated storage key of the re-encoded school logo (public: shown on sign-in pages). */
    logoKey: text("logo_key"),
    ...timestamps,
  },
  (t) => [check("school_settings_singleton", sql`${t.id} = 1`)],
);

/** Campuses of the school, each in its own area. */
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    status: branchStatus("status").notNull().default("active"),
    /** Town, district, or neighbourhood the branch serves. */
    area: text("area"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    ...timestamps,
  },
  (t) => [unique("branches_code_key").on(t.code)],
);

/** Staff accounts and their access scope. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: userStatus("status").notNull().default("invited"),
    accessScope: accessScope("access_scope").notNull().default("branch"),
    /** argon2id hash; null until the user sets a password via invitation or reset link. */
    passwordHash: text("password_hash"),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    /** Generated storage key of the re-encoded profile photo; never a user-supplied name. */
    avatarKey: text("avatar_key"),
    ...timestamps,
  },
  (t) => [
    unique("users_email_key").on(t.email),
    check("users_email_normalized", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

/** Branches a branch-scoped user works in. */
export const userBranches = pgTable(
  "user_branches",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.branchId] }),
    index("user_branches_branch_id_idx").on(t.branchId),
  ],
);

/** Stable permission codes, e.g. "users.invite". Defined by migrations only. */
export const permissions = pgTable("permissions", {
  code: text("code").primaryKey(),
  description: text("description").notNull(),
});

/** Roles. System roles are installed by migrations and cannot be edited in the app. */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
  },
  (t) => [unique("roles_key_key").on(t.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    index("user_roles_role_id_idx").on(t.roleId),
  ],
);

/** Append-only audit trail. Updates and deletes are blocked by a trigger. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    outcome: auditOutcome("outcome").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [index("audit_events_occurred_at_idx").on(t.occurredAt)],
);

/**
 * Server-side sessions. The cookie holds a random token; only its SHA-256 hash is stored, so a
 * database leak does not expose usable sessions. Revocation takes effect on the next request.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Optional branch filter; validated against the user's scope on every use. */
    activeBranchId: uuid("active_branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Last time the user re-entered their password; gates high-risk actions. */
    reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }),
    userAgent: text("user_agent"),
  },
  (t) => [
    unique("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

/** Single-use password reset tokens, stored hashed. */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    unique("password_reset_tokens_token_hash_key").on(t.tokenHash),
    index("password_reset_tokens_user_id_idx").on(t.userId),
  ],
);

/** Account-setup invitations. Only the SHA-256 hash of the emailed token is stored. */
export const userInvitations = pgTable(
  "user_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    unique("user_invitations_token_hash_key").on(t.tokenHash),
    index("user_invitations_user_id_idx").on(t.userId),
  ],
);

/** Fixed-window counters for rate limiting; shared by all app instances. */
export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
