// Table definitions only — no secrets or connection logic, so drizzle-kit can load this file
// directly. Row-level security, roles, grants, and triggers live in hand-written migrations.
//
// One installation serves exactly one school. The school has many branches (campuses in
// different areas); staff work either school-wide or in assigned branches.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
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
/** Academic records are archived, never deleted, so history (marks, attendance) stays valid. */
export const recordStatus = pgEnum("record_status", ["active", "archived"]);

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

/** School years, e.g. "2026-2027". Exactly one may be current. School-wide. */
export const academicYears = pgTable(
  "academic_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    unique("academic_years_name_key").on(t.name),
    check("academic_years_dates", sql`${t.startsOn} < ${t.endsOn}`),
  ],
);

/** Terms or semesters within a year, in order. */
export const terms = pgTable(
  "terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    unique("terms_academic_year_id_name_key").on(t.academicYearId, t.name),
    unique("terms_academic_year_id_sequence_key").on(t.academicYearId, t.sequence),
    check("terms_dates", sql`${t.startsOn} < ${t.endsOn}`),
    check("terms_sequence_positive", sql`${t.sequence} > 0`),
  ],
);

/** Grade levels offered by the school, e.g. Grade 1 or Form 4. School-wide. */
export const gradeLevels = pgTable(
  "grade_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    sortOrder: integer("sort_order").notNull(),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [unique("grade_levels_code_key").on(t.code), unique("grade_levels_name_key").on(t.name)],
);

/** A grade level taught at a branch in a given year. Branch-scoped. */
export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "restrict" }),
    gradeLevelId: uuid("grade_level_id")
      .notNull()
      .references(() => gradeLevels.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    unique("classes_branch_year_grade_key").on(t.branchId, t.academicYearId, t.gradeLevelId),
    // Target for the sections composite key: a section always shares the branch of its class.
    unique("classes_id_branch_id_key").on(t.id, t.branchId),
    index("classes_branch_id_academic_year_id_idx").on(t.branchId, t.academicYearId),
  ],
);

/** Sections (streams) of a class, e.g. "A" and "B". Branch-scoped through their class. */
export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    name: text("name").notNull(),
    capacity: integer("capacity"),
    room: text("room"),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "sections_class_fk",
      columns: [t.classId, t.branchId],
      foreignColumns: [classes.id, classes.branchId],
    }).onDelete("restrict"),
    unique("sections_class_id_name_key").on(t.classId, t.name),
    // Target for the student placement key: a student sits only in a section of their branch.
    unique("sections_id_branch_id_key").on(t.id, t.branchId),
    check("sections_capacity_positive", sql`${t.capacity} is null or ${t.capacity} > 0`),
    index("sections_branch_id_idx").on(t.branchId),
  ],
);

/** Generates school-wide student numbers such as 2026-00001. */
export const studentNumberSeq = pgSequence("student_number_seq", { startWith: 1 });

export const studentStatus = pgEnum("student_status", [
  "enrolled",
  "suspended",
  "withdrawn",
  "graduated",
]);
export const studentGender = pgEnum("student_gender", ["female", "male"]);

/**
 * A student, enrolled at exactly one branch at a time. Never deleted: leaving the school is a
 * status. Phone, address, and medical notes are sensitive (students.read_sensitive).
 */
export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** School-wide unique, generated by the database, never edited. */
    studentNumber: text("student_number")
      .notNull()
      .default(
        sql`to_char(current_date, 'YYYY') || '-' || lpad(nextval('student_number_seq')::text, 5, '0')`,
      ),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    /** Class placement; always a section of the student's own branch (composite key). */
    sectionId: uuid("section_id"),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    gender: studentGender("gender").notNull(),
    admissionDate: date("admission_date").notNull(),
    status: studentStatus("status").notNull().default("enrolled"),
    previousSchool: text("previous_school"),
    /** Student contact phone (older students). Sensitive, like the address. */
    phone: text("phone"),
    address: text("address"),
    medicalNotes: text("medical_notes"),
    /** Re-encoded WebP in object storage; served only to staff who can see the student. */
    photoKey: text("photo_key"),
    ...timestamps,
  },
  (t) => [
    unique("students_student_number_key").on(t.studentNumber),
    // Target for guardian and transfer keys that must follow the student's branch.
    unique("students_id_branch_id_key").on(t.id, t.branchId),
    foreignKey({
      name: "students_section_fk",
      columns: [t.sectionId, t.branchId],
      foreignColumns: [sections.id, sections.branchId],
    }).onDelete("restrict"),
    check("students_birth_before_admission", sql`${t.dateOfBirth} < ${t.admissionDate}`),
    index("students_branch_id_status_idx").on(t.branchId, t.status),
    index("students_section_id_idx").on(t.sectionId),
    index("students_name_dob_idx").on(
      sql`lower(${t.lastName})`,
      sql`lower(${t.firstName})`,
      t.dateOfBirth,
    ),
  ],
);

/** Parents and guardians of a student. Their branch follows the student on transfer. */
export const studentGuardians = pgTable(
  "student_guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    fullName: text("full_name").notNull(),
    relationship: text("relationship").notNull(),
    /** Contact details are sensitive (students.read_sensitive). */
    phone: text("phone"),
    email: text("email"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "student_guardians_student_fk",
      columns: [t.studentId, t.branchId],
      foreignColumns: [students.id, students.branchId],
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    index("student_guardians_student_id_idx").on(t.studentId),
  ],
);

/** Branch transfer history. Append-only. */
export const studentTransfers = pgTable(
  "student_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    fromBranchId: uuid("from_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    toBranchId: uuid("to_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    effectiveOn: date("effective_on").notNull(),
    reason: text("reason"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("student_transfers_different_branches", sql`${t.fromBranchId} <> ${t.toBranchId}`),
    index("student_transfers_student_id_idx").on(t.studentId),
  ],
);
