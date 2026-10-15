import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import {
  canAccessBranch,
  hasPermission,
  requirePermission,
  withAccess,
  type AccessContext,
} from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import type { Database, Transaction } from "@/server/db/client";
import {
  academicYears,
  branches,
  classes,
  sections,
  studentGuardians,
  students,
  studentTransfers,
  users,
} from "@/server/db/schema";
import { recordAudit } from "@/server/modules/audit/record";
import { processAvatar } from "@/server/modules/profile/avatar-image";
import type { ObjectStorage } from "@/server/storage/object-storage";

/*
 * Student records. A student belongs to one branch at a time; branch staff see only students of
 * their branches (service checks and row-level security). Address, medical notes, and guardian
 * contact details are sensitive: they are selected only for users with students.read_sensitive.
 * Students are never deleted: leaving is a status, and transfers keep a history.
 */

export type StudentStatus = "enrolled" | "suspended" | "withdrawn" | "graduated";
export const STUDENT_STATUSES: readonly StudentStatus[] = [
  "enrolled",
  "suspended",
  "withdrawn",
  "graduated",
];

export interface StudentListItem {
  id: string;
  studentNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: "female" | "male";
  status: StudentStatus;
  branchId: string;
  branchName: string;
  className: string | null;
  sectionName: string | null;
  hasPhoto: boolean;
}

export interface GuardianView {
  id: string;
  fullName: string;
  relationship: string;
  isPrimary: boolean;
  /** Present only for users with students.read_sensitive. */
  phone?: string | null;
  email?: string | null;
}

export interface TransferView {
  id: string;
  /** Null when that branch is outside the reader's scope. */
  fromBranchName: string | null;
  toBranchName: string | null;
  effectiveOn: string;
  reason: string | null;
  actorName: string | null;
  createdAt: Date;
}

export interface StudentDetail extends StudentListItem {
  dateOfBirth: string;
  admissionDate: string;
  previousSchool: string | null;
  sectionId: string | null;
  academicYearName: string | null;
  /** Whether the sensitive fields below were loaded for this user. */
  sensitiveVisible: boolean;
  /** Changes whenever the record does; used to refresh the cached photo. */
  photoVersion: Date;
  phone?: string | null;
  address?: string | null;
  medicalNotes?: string | null;
  guardians: GuardianView[];
  transfers: TransferView[];
}

/** Admission matches an existing student by name and date of birth; confirm to continue. */
export class PossibleDuplicateError extends Error {
  constructor(readonly matches: number) {
    super(
      matches === 1
        ? "A student with the same name and date of birth is already registered."
        : `${matches} students with the same name and date of birth are already registered.`,
    );
    this.name = "PossibleDuplicateError";
  }
}

/** A rule the data breaks, tied to a form field. */
export class StudentRuleError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "StudentRuleError";
  }
}

const uuid = z.uuid();
const isoDate = z.iso.date("Enter a valid date.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .optional();
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email address.",
  )
  .transform((value) => (value === "" ? null : value))
  .optional();
const optionalSection = z
  .union([z.literal(""), z.uuid()])
  .transform((value) => (value === "" ? null : value))
  .optional();

const personFields = {
  firstName: z.string().trim().min(1, "Enter the first name.").max(80),
  middleName: optionalText(80),
  lastName: z.string().trim().min(1, "Enter the last name.").max(80),
  dateOfBirth: isoDate,
  gender: z.enum(["female", "male"], "Choose the gender."),
  previousSchool: optionalText(160),
  phone: optionalText(40),
  address: optionalText(300),
  medicalNotes: optionalText(1000),
};

export const guardianInput = z
  .object({
    fullName: z.string().trim().min(2, "Enter the guardian's name.").max(120),
    relationship: z.string().trim().min(2, "Enter the relationship, e.g. Mother.").max(40),
    phone: optionalText(40),
    email: optionalEmail,
  })
  .strict();

// .strict() rejects forged keys such as "status" or "studentNumber".
export const admissionInput = z
  .object({
    ...personFields,
    branchId: z.uuid("Choose a branch."),
    sectionId: optionalSection,
    admissionDate: isoDate,
    guardian: guardianInput,
    /** Set after the user has seen the possible-duplicate warning. */
    confirmDuplicate: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.dateOfBirth < value.admissionDate, {
    message: "Date of birth must be before the admission date.",
    path: ["dateOfBirth"],
  });

export const studentUpdateInput = z.object(personFields).partial().strict();

export const transferInput = z
  .object({
    toBranchId: z.uuid("Choose the new branch."),
    effectiveOn: isoDate,
    reason: optionalText(300),
  })
  .strict();

const SENSITIVE_STUDENT_FIELDS = ["phone", "address", "medicalNotes"] as const;
const SENSITIVE_GUARDIAN_FIELDS = ["phone", "email"] as const;

function canSeeSensitive(context: AccessContext): boolean {
  return hasPermission(context, "students.read_sensitive");
}

/** Without students.read_sensitive, sensitive fields can be neither read nor written. */
function stripSensitive<T extends Record<string, unknown>>(
  context: AccessContext,
  data: T,
  fields: readonly string[],
): T {
  if (canSeeSensitive(context)) return data;
  const copy: Record<string, unknown> = { ...data };
  for (const field of fields) delete copy[field];
  return copy as T;
}

function studentScope(context: AccessContext): SQL | undefined {
  if (context.scope.kind === "school") return undefined;
  if (context.scope.branchIds.length === 0) return sql`false`;
  return inArray(students.branchId, [...context.scope.branchIds]);
}

function translate(error: unknown): never {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint } = current as { code?: string; constraint?: string };
    if (code === "23503" && constraint === "students_section_fk") {
      throw new StudentRuleError("Choose a section of the student's branch.", "sectionId");
    }
    if (code === "23514" && constraint === "students_birth_before_admission") {
      throw new StudentRuleError("Date of birth must be before the admission date.", "dateOfBirth");
    }
    current = current.cause;
  }
  throw error;
}

const listColumns = {
  id: students.id,
  studentNumber: students.studentNumber,
  firstName: students.firstName,
  middleName: students.middleName,
  lastName: students.lastName,
  gender: students.gender,
  status: students.status,
  branchId: students.branchId,
  branchName: branches.name,
  className: classes.name,
  sectionName: sections.name,
  hasPhoto: sql<boolean>`${students.photoKey} is not null`,
};

// ---------------------------------------------------------------- reading

export async function listStudents(
  db: Database,
  context: AccessContext,
  filter: {
    branchId?: string | null;
    sectionId?: string | null;
    status?: string | null;
    search?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): Promise<StudentListItem[]> {
  requirePermission(context, "students.read");
  const branchId =
    filter.branchId && uuid.safeParse(filter.branchId).success ? filter.branchId : null;
  if (branchId && !canAccessBranch(context, branchId)) return [];
  const sectionId =
    filter.sectionId && uuid.safeParse(filter.sectionId).success ? filter.sectionId : null;
  const status = STUDENT_STATUSES.find((value) => value === filter.status) ?? null;
  const search = filter.search?.trim().slice(0, 80) ?? "";
  const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  return withAccess(db, context, (tx) =>
    tx
      .select(listColumns)
      .from(students)
      .innerJoin(branches, eq(branches.id, students.branchId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .leftJoin(classes, eq(classes.id, sections.classId))
      .where(
        and(
          studentScope(context),
          branchId ? eq(students.branchId, branchId) : undefined,
          sectionId ? eq(students.sectionId, sectionId) : undefined,
          status ? eq(students.status, status) : undefined,
          search
            ? or(
                ilike(students.firstName, pattern),
                ilike(students.lastName, pattern),
                ilike(students.studentNumber, pattern),
                ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, pattern),
              )
            : undefined,
        ),
      )
      .orderBy(asc(students.lastName), asc(students.firstName), asc(students.id))
      .limit(limit)
      .offset(offset),
  );
}

/** One student in scope, or null — a student of another branch looks exactly like a missing one. */
export async function getStudent(
  db: Database,
  context: AccessContext,
  studentId: string,
): Promise<StudentDetail | null> {
  requirePermission(context, "students.read");
  if (!uuid.safeParse(studentId).success) return null;
  const sensitive = canSeeSensitive(context);
  const fromBranch = alias(branches, "from_branch");
  const toBranch = alias(branches, "to_branch");

  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .select({
        ...listColumns,
        dateOfBirth: students.dateOfBirth,
        admissionDate: students.admissionDate,
        previousSchool: students.previousSchool,
        sectionId: students.sectionId,
        academicYearName: academicYears.name,
        ...(sensitive
          ? {
              phone: students.phone,
              address: students.address,
              medicalNotes: students.medicalNotes,
            }
          : {}),
        photoVersion: students.updatedAt,
      })
      .from(students)
      .innerJoin(branches, eq(branches.id, students.branchId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .leftJoin(classes, eq(classes.id, sections.classId))
      .leftJoin(academicYears, eq(academicYears.id, classes.academicYearId))
      .where(and(studentScope(context), eq(students.id, studentId)))
      .limit(1);
    if (!row) return null;

    const [guardians, transfers] = await Promise.all([
      tx
        .select({
          id: studentGuardians.id,
          fullName: studentGuardians.fullName,
          relationship: studentGuardians.relationship,
          isPrimary: studentGuardians.isPrimary,
          ...(sensitive ? { phone: studentGuardians.phone, email: studentGuardians.email } : {}),
        })
        .from(studentGuardians)
        .where(eq(studentGuardians.studentId, studentId))
        .orderBy(desc(studentGuardians.isPrimary), asc(studentGuardians.fullName)),
      tx
        .select({
          id: studentTransfers.id,
          fromBranchName: fromBranch.name,
          toBranchName: toBranch.name,
          effectiveOn: studentTransfers.effectiveOn,
          reason: studentTransfers.reason,
          actorName: users.displayName,
          createdAt: studentTransfers.createdAt,
        })
        .from(studentTransfers)
        .leftJoin(fromBranch, eq(fromBranch.id, studentTransfers.fromBranchId))
        .leftJoin(toBranch, eq(toBranch.id, studentTransfers.toBranchId))
        .leftJoin(users, eq(users.id, studentTransfers.actorUserId))
        .where(eq(studentTransfers.studentId, studentId))
        .orderBy(desc(studentTransfers.createdAt)),
    ]);
    return { ...row, sensitiveVisible: sensitive, guardians, transfers };
  });
}

/** Count of students anywhere in the school with this name and date of birth. */
export async function countPossibleDuplicates(
  db: Database,
  context: AccessContext,
  person: { firstName: string; lastName: string; dateOfBirth: string },
): Promise<number> {
  requirePermission(context, "students.create");
  return withAccess(db, context, async (tx) => {
    const result = await tx.execute<{ matches: number }>(
      sql`select app.count_possible_duplicate_students(${person.firstName}, ${person.lastName}, ${person.dateOfBirth}::date) as matches`,
    );
    return Number(result.rows[0]?.matches ?? 0);
  });
}

// ---------------------------------------------------------------- admission and edits

async function assertActiveSection(
  tx: Transaction,
  sectionId: string,
  branchId: string,
): Promise<void> {
  const [section] = await tx
    .select({ status: sections.status, classStatus: classes.status })
    .from(sections)
    .innerJoin(classes, eq(classes.id, sections.classId))
    .where(and(eq(sections.id, sectionId), eq(sections.branchId, branchId)))
    .limit(1);
  if (!section || section.status !== "active" || section.classStatus !== "active") {
    throw new StudentRuleError("Choose an active section of the student's branch.", "sectionId");
  }
}

/** A photo upload: bytes are decoded, checked, and re-encoded before anything is stored. */
export interface PhotoUpload {
  storage: ObjectStorage;
  bytes: Uint8Array;
}

function photoKey(studentId: string): string {
  return `students/${studentId}/${randomBytes(12).toString("hex")}.webp`;
}

export async function admitStudent(
  db: Database,
  context: AccessContext,
  input: unknown,
  photo?: PhotoUpload,
): Promise<{ id: string; studentNumber: string }> {
  requirePermission(context, "students.create");
  const parsed = admissionInput.parse(input);
  if (!canAccessBranch(context, parsed.branchId)) throw new ForbiddenError();
  // Validate the photo before creating anything, so a bad file never leaves a half-made record.
  const image = photo ? await processAvatar(photo.bytes) : null;
  const { guardian: guardianData, confirmDuplicate, ...rest } = parsed;
  const data = stripSensitive(context, rest, SENSITIVE_STUDENT_FIELDS);
  const guardian = stripSensitive(context, guardianData, SENSITIVE_GUARDIAN_FIELDS);

  if (!confirmDuplicate) {
    const matches = await countPossibleDuplicates(db, context, data);
    if (matches > 0) throw new PossibleDuplicateError(matches);
  }

  const id = crypto.randomUUID();
  const key = image ? photoKey(id) : null;
  if (key && image && photo) await photo.storage.put(key, image, "image/webp");

  return withAccess(db, context, async (tx) => {
    const [branch] = await tx
      .select({ status: branches.status })
      .from(branches)
      .where(eq(branches.id, data.branchId))
      .limit(1);
    if (!branch) throw new ForbiddenError();
    if (branch.status !== "active") {
      throw new StudentRuleError("This branch is inactive.", "branchId");
    }
    if (data.sectionId) await assertActiveSection(tx, data.sectionId, data.branchId);

    const [row] = await tx
      .insert(students)
      .values({ ...data, id, photoKey: key })
      .returning({ id: students.id, studentNumber: students.studentNumber });
    await tx.insert(studentGuardians).values({
      ...guardian,
      studentId: row.id,
      branchId: data.branchId,
      isPrimary: true,
    });
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "student.admit",
      targetType: "student",
      targetId: row.id,
      branchId: data.branchId,
      metadata: { duplicateConfirmed: confirmDuplicate === true },
    });
    return row;
  }).catch(async (error: unknown) => {
    // Nothing was saved, so the stored photo must not be left behind.
    if (key) await photo?.storage.delete(key);
    return translate(error);
  });
}

/** The student's branch through RLS: null when the student is outside the caller's scope. */
async function studentBranch(
  db: Database,
  context: AccessContext,
  studentId: string,
): Promise<string | null> {
  if (!uuid.safeParse(studentId).success) return null;
  const [row] = await withAccess(db, context, (tx) =>
    tx
      .select({ branchId: students.branchId })
      .from(students)
      .where(and(studentScope(context), eq(students.id, studentId)))
      .limit(1),
  );
  return row?.branchId ?? null;
}

export async function updateStudent(
  db: Database,
  context: AccessContext,
  studentId: string,
  input: unknown,
): Promise<boolean> {
  requirePermission(context, "students.update");
  const branchId = await studentBranch(db, context, studentId);
  if (!branchId) return false;
  const data = stripSensitive(context, studentUpdateInput.parse(input), SENSITIVE_STUDENT_FIELDS);
  if (Object.keys(data).length === 0) return true;
  return withAccess(db, context, async (tx) => {
    await tx.update(students).set(data).where(eq(students.id, studentId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "student.update",
      targetType: "student",
      targetId: studentId,
      branchId,
      metadata: { fields: Object.keys(data).sort() },
    });
    return true;
  }).catch(translate);
}

/** Place a student in a section of their branch, or remove the placement (null). */
export async function placeStudent(
  db: Database,
  context: AccessContext,
  studentId: string,
  sectionId: unknown,
): Promise<boolean> {
  requirePermission(context, "students.update");
  const branchId = await studentBranch(db, context, studentId);
  if (!branchId) return false;
  const section = optionalSection.parse(sectionId) ?? null;
  return withAccess(db, context, async (tx) => {
    if (section) await assertActiveSection(tx, section, branchId);
    await tx.update(students).set({ sectionId: section }).where(eq(students.id, studentId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "student.place",
      targetType: "student",
      targetId: studentId,
      branchId,
      metadata: { sectionId: section },
    });
    return true;
  }).catch(translate);
}

export async function setStudentStatus(
  db: Database,
  context: AccessContext,
  studentId: string,
  status: unknown,
): Promise<boolean> {
  requirePermission(context, "students.update");
  const branchId = await studentBranch(db, context, studentId);
  if (!branchId) return false;
  const next = z.enum(STUDENT_STATUSES as [StudentStatus, ...StudentStatus[]]).parse(status);
  return withAccess(db, context, async (tx) => {
    const [before] = await tx
      .select({ status: students.status })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (before?.status === next) return true;
    await tx.update(students).set({ status: next }).where(eq(students.id, studentId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "student.status",
      targetType: "student",
      targetId: studentId,
      branchId,
      metadata: { from: before?.status, to: next },
    });
    return true;
  });
}

export async function addGuardian(
  db: Database,
  context: AccessContext,
  studentId: string,
  input: unknown,
): Promise<boolean> {
  requirePermission(context, "students.update");
  const branchId = await studentBranch(db, context, studentId);
  if (!branchId) return false;
  const data = stripSensitive(context, guardianInput.parse(input), SENSITIVE_GUARDIAN_FIELDS);
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .insert(studentGuardians)
      .values({ ...data, studentId, branchId })
      .returning({ id: studentGuardians.id });
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "student.guardian_add",
      targetType: "student",
      targetId: studentId,
      branchId,
      metadata: { guardianId: row.id },
    });
    return true;
  });
}

/**
 * Move a student to another branch. Their class placement ends (sections belong to a branch),
 * guardians follow automatically, and the move is recorded in the transfer history and audit log.
 * Both branches must be within the caller's scope; the database enforces the same rule.
 */
export async function transferStudent(
  db: Database,
  context: AccessContext,
  studentId: string,
  input: unknown,
): Promise<boolean> {
  requirePermission(context, "students.transfer");
  const fromBranchId = await studentBranch(db, context, studentId);
  if (!fromBranchId) return false;
  const data = transferInput.parse(input);
  if (data.toBranchId === fromBranchId) {
    throw new StudentRuleError("The student is already at this branch.", "toBranchId");
  }
  if (!canAccessBranch(context, data.toBranchId)) throw new ForbiddenError();
  return withAccess(db, context, async (tx) => {
    const [target] = await tx
      .select({ status: branches.status })
      .from(branches)
      .where(eq(branches.id, data.toBranchId))
      .limit(1);
    if (!target || target.status !== "active") {
      throw new StudentRuleError("Choose an active branch.", "toBranchId");
    }
    await tx
      .update(students)
      .set({ branchId: data.toBranchId, sectionId: null })
      .where(eq(students.id, studentId));
    await tx.insert(studentTransfers).values({
      studentId,
      fromBranchId,
      toBranchId: data.toBranchId,
      effectiveOn: data.effectiveOn,
      reason: data.reason ?? null,
      actorUserId: context.userId,
    });
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "student.transfer",
      targetType: "student",
      targetId: studentId,
      branchId: fromBranchId,
      metadata: { fromBranchId, toBranchId: data.toBranchId },
    });
    return true;
  });
}

/** Active sections in a branch, for placement pickers. */
export async function listPlacementOptions(
  db: Database,
  context: AccessContext,
  branchId: string,
): Promise<{ id: string; label: string }[]> {
  requirePermission(context, "students.read");
  if (!uuid.safeParse(branchId).success || !canAccessBranch(context, branchId)) return [];
  return withAccess(db, context, async (tx) => {
    const rows = await tx
      .select({
        id: sections.id,
        className: classes.name,
        sectionName: sections.name,
        yearName: academicYears.name,
        isCurrent: academicYears.isCurrent,
      })
      .from(sections)
      .innerJoin(classes, eq(classes.id, sections.classId))
      .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
      .where(
        and(
          eq(sections.branchId, branchId),
          eq(sections.status, "active"),
          eq(classes.status, "active"),
          eq(academicYears.status, "active"),
        ),
      )
      .orderBy(desc(academicYears.isCurrent), asc(classes.name), asc(sections.name))
      .limit(300);
    return rows.map((row) => ({
      id: row.id,
      label: `${row.className} ${row.sectionName}${row.isCurrent ? "" : ` (${row.yearName})`}`,
    }));
  });
}

// ---------------------------------------------------------------- photos

/** Storage key of a student's photo, only if the student is visible to the caller. */
export async function getVisibleStudentPhotoKey(
  db: Database,
  context: AccessContext,
  studentId: string,
): Promise<string | null> {
  if (!hasPermission(context, "students.read") || !uuid.safeParse(studentId).success) return null;
  const [row] = await withAccess(db, context, (tx) =>
    tx
      .select({ key: students.photoKey })
      .from(students)
      .where(and(studentScope(context), eq(students.id, studentId)))
      .limit(1),
  );
  return row?.key ?? null;
}

/** Replace a student's photo. The old file is removed once the record points at the new one. */
export async function setStudentPhoto(
  db: Database,
  context: AccessContext,
  studentId: string,
  photo: PhotoUpload,
): Promise<boolean> {
  requirePermission(context, "students.update");
  const branchId = await studentBranch(db, context, studentId);
  if (!branchId) return false;
  const image = await processAvatar(photo.bytes);
  const key = photoKey(studentId);
  await photo.storage.put(key, image, "image/webp");
  const previous = await withAccess(db, context, async (tx) => {
    const [row] = await tx
      .select({ key: students.photoKey })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    await tx.update(students).set({ photoKey: key }).where(eq(students.id, studentId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "student.photo_update",
      targetType: "student",
      targetId: studentId,
      branchId,
    });
    return row?.key ?? null;
  }).catch(async (error: unknown) => {
    await photo.storage.delete(key);
    throw error;
  });
  if (previous) await photo.storage.delete(previous);
  return true;
}

export async function removeStudentPhoto(
  db: Database,
  context: AccessContext,
  storage: ObjectStorage,
  studentId: string,
): Promise<boolean> {
  requirePermission(context, "students.update");
  const branchId = await studentBranch(db, context, studentId);
  if (!branchId) return false;
  const previous = await withAccess(db, context, async (tx) => {
    const [row] = await tx
      .select({ key: students.photoKey })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!row?.key) return null;
    await tx.update(students).set({ photoKey: null }).where(eq(students.id, studentId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "student.photo_remove",
      targetType: "student",
      targetId: studentId,
      branchId,
    });
    return row.key;
  });
  if (previous) await storage.delete(previous);
  return true;
}
