// Table definitions only — no secrets or connection logic, so drizzle-kit can load this file
// directly. Row-level security, roles, grants, and triggers live in hand-written migrations.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const schoolStatus = pgEnum("school_status", ["pending", "active", "suspended", "closed"]);
export const branchStatus = pgEnum("branch_status", ["active", "inactive"]);
export const userStatus = pgEnum("user_status", ["invited", "active", "suspended", "deactivated"]);
export const membershipStatus = pgEnum("membership_status", ["active", "suspended", "removed"]);
export const membershipScope = pgEnum("membership_scope", ["school", "branch"]);
export const auditOutcome = pgEnum("audit_outcome", ["success", "denied", "failure"]);

export const schools = pgTable(
  "schools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: schoolStatus("status").notNull().default("pending"),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en"),
    ...timestamps,
  },
  (t) => [
    unique("schools_slug_key").on(t.slug),
    check("schools_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    status: branchStatus("status").notNull().default("active"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    ...timestamps,
  },
  (t) => [
    // Target for composite foreign keys so child rows cannot mix schools and branches.
    unique("branches_school_id_id_key").on(t.schoolId, t.id),
    unique("branches_school_id_code_key").on(t.schoolId, t.code),
  ],
);

/** Global login identity. A user may belong to several schools through memberships. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: userStatus("status").notNull().default("invited"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    /** argon2id hash; null until the user sets a password via invitation or reset link. */
    passwordHash: text("password_hash"),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("users_email_key").on(t.email),
    check("users_email_normalized", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

export const schoolMemberships = pgTable(
  "school_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: membershipStatus("status").notNull().default("active"),
    scope: membershipScope("scope").notNull().default("branch"),
    ...timestamps,
  },
  (t) => [
    unique("school_memberships_school_id_user_id_key").on(t.schoolId, t.userId),
    unique("school_memberships_school_id_id_key").on(t.schoolId, t.id),
    index("school_memberships_user_id_idx").on(t.userId),
  ],
);

/** Branches a branch-scoped membership may access. Both FKs include school_id. */
export const membershipBranches = pgTable(
  "membership_branches",
  {
    schoolId: uuid("school_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.branchId] }),
    foreignKey({
      name: "membership_branches_membership_fk",
      columns: [t.schoolId, t.membershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "membership_branches_branch_fk",
      columns: [t.schoolId, t.branchId],
      foreignColumns: [branches.schoolId, branches.id],
    }).onDelete("restrict"),
    index("membership_branches_school_id_branch_id_idx").on(t.schoolId, t.branchId),
  ],
);

/** Append-only audit trail. Updates and deletes are blocked by a trigger. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id"),
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
  (t) => [
    foreignKey({
      name: "audit_events_branch_fk",
      columns: [t.schoolId, t.branchId],
      foreignColumns: [branches.schoolId, branches.id],
    }).onDelete("restrict"),
    index("audit_events_school_id_occurred_at_idx").on(t.schoolId, t.occurredAt),
  ],
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
    /** School selected by the user; always re-validated against active membership on use. */
    activeSchoolId: uuid("active_school_id").references(() => schools.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
  },
  (t) => [
    unique("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

/** Single-use password reset / account setup tokens, stored hashed. */
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

/** Fixed-window counters for rate limiting; shared by all app instances. */
export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
