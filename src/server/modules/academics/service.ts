import "server-only";

import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  canAccessBranch,
  requirePermission,
  withAccess,
  type AccessContext,
} from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import type { Database } from "@/server/db/client";
import { academicYears, branches, classes, gradeLevels, sections, terms } from "@/server/db/schema";
import { recordAudit } from "@/server/modules/audit/record";

/*
 * Academic structure. Years, terms, and grade levels are school-wide and configured by
 * school-wide administrators (academics.configure). Classes and sections belong to a branch and
 * are managed inside the caller's branches (classes.manage). Nothing is ever deleted: records
 * are archived so later marks, attendance, and reports keep pointing at valid history.
 */

export type RecordStatus = "active" | "archived";

export interface TermView {
  id: string;
  academicYearId: string;
  name: string;
  sequence: number;
  startsOn: string;
  endsOn: string;
  status: RecordStatus;
}

export interface AcademicYearView {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  status: RecordStatus;
  terms: TermView[];
}

export interface GradeLevelView {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  status: RecordStatus;
}

export interface SectionView {
  id: string;
  classId: string;
  name: string;
  capacity: number | null;
  room: string | null;
  status: RecordStatus;
}

export interface ClassView {
  id: string;
  branchId: string;
  branchName: string;
  academicYearId: string;
  academicYearName: string;
  gradeLevelId: string;
  gradeLevelName: string;
  name: string;
  status: RecordStatus;
  sections: SectionView[];
}

/** A rule the data breaks (duplicate name, dates outside the year). Carries the form field. */
export class AcademicConflictError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "AcademicConflictError";
  }
}

const CONSTRAINT_MESSAGES: Record<string, [field: string, message: string]> = {
  academic_years_name_key: ["name", "Another academic year already has this name."],
  academic_years_dates: ["endsOn", "The year must end after it starts."],
  academic_years_single_current: ["form", "Another year is already marked as current."],
  terms_academic_year_id_name_key: ["name", "This year already has a term with this name."],
  terms_academic_year_id_sequence_key: [
    "sequence",
    "This year already has a term in this position.",
  ],
  terms_dates: ["endsOn", "The term must end after it starts."],
  terms_within_year: ["startsOn", "Term dates must fall within the academic year."],
  grade_levels_code_key: ["code", "Another grade level already uses this code."],
  grade_levels_name_key: ["name", "Another grade level already has this name."],
  classes_branch_year_grade_key: [
    "gradeLevelId",
    "This branch already has a class for this grade in this year.",
  ],
  sections_class_id_name_key: ["name", "This class already has a section with this name."],
  sections_capacity_positive: ["capacity", "Capacity must be at least 1."],
};

/** Turn known constraint violations into friendly, field-specific errors. */
function translate(error: unknown): never {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint } = current as { code?: string; constraint?: string };
    if ((code === "23505" || code === "23514") && constraint && CONSTRAINT_MESSAGES[constraint]) {
      const [field, message] = CONSTRAINT_MESSAGES[constraint];
      throw new AcademicConflictError(message, field);
    }
    current = current.cause;
  }
  throw error;
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

// .strict() everywhere: forged keys such as "status", "isCurrent", or "branchId" fail loudly.
export const academicYearInput = z
  .object({
    name: z.string().trim().min(4, "Enter the year name, e.g. 2026-2027.").max(40),
    startsOn: isoDate,
    endsOn: isoDate,
  })
  .strict()
  .refine((value) => value.startsOn < value.endsOn, {
    message: "The year must end after it starts.",
    path: ["endsOn"],
  });

export const termInput = z
  .object({
    name: z.string().trim().min(2, "Enter the term name.").max(60),
    sequence: z.coerce.number().int().min(1, "Use 1 or more.").max(12),
    startsOn: isoDate,
    endsOn: isoDate,
  })
  .strict()
  .refine((value) => value.startsOn < value.endsOn, {
    message: "The term must end after it starts.",
    path: ["endsOn"],
  });

export const gradeLevelInput = z
  .object({
    name: z.string().trim().min(2, "Enter the grade name.").max(60),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{1,12}$/, "Use 1–12 letters, numbers, or dashes."),
    sortOrder: z.coerce.number().int().min(0).max(999),
  })
  .strict();

export const classInput = z
  .object({
    branchId: uuid,
    academicYearId: z.uuid("Choose an academic year."),
    gradeLevelId: z.uuid("Choose a grade level."),
    /** Defaults to the grade level's name. */
    name: optionalText(80),
  })
  .strict();

export const sectionInput = z
  .object({
    name: z.string().trim().min(1, "Enter the section name.").max(40),
    capacity: z
      .union([
        z.literal(""),
        z.coerce.number().int().min(1, "Capacity must be at least 1.").max(500),
      ])
      .transform((value) => (value === "" ? null : value))
      .optional(),
    room: optionalText(60),
  })
  .strict();

/** School-wide structure (years, terms, grades) is configured only by school-wide admins. */
function requireConfigure(context: AccessContext): void {
  requirePermission(context, "academics.configure");
  if (context.scope.kind !== "school") throw new ForbiddenError();
}

const yearColumns = {
  id: academicYears.id,
  name: academicYears.name,
  startsOn: academicYears.startsOn,
  endsOn: academicYears.endsOn,
  isCurrent: academicYears.isCurrent,
  status: academicYears.status,
};

const termColumns = {
  id: terms.id,
  academicYearId: terms.academicYearId,
  name: terms.name,
  sequence: terms.sequence,
  startsOn: terms.startsOn,
  endsOn: terms.endsOn,
  status: terms.status,
};

const gradeColumns = {
  id: gradeLevels.id,
  name: gradeLevels.name,
  code: gradeLevels.code,
  sortOrder: gradeLevels.sortOrder,
  status: gradeLevels.status,
};

const sectionColumns = {
  id: sections.id,
  classId: sections.classId,
  name: sections.name,
  capacity: sections.capacity,
  room: sections.room,
  status: sections.status,
};

// ---------------------------------------------------------------- academic years and terms

/** Every year with its terms, newest first. Readable by anyone with academics.read. */
export async function listAcademicYears(
  db: Database,
  context: AccessContext,
): Promise<AcademicYearView[]> {
  requirePermission(context, "academics.read");
  return withAccess(db, context, async (tx) => {
    const years = await tx
      .select(yearColumns)
      .from(academicYears)
      .orderBy(desc(academicYears.startsOn))
      .limit(100);
    if (years.length === 0) return [];
    const allTerms = await tx
      .select(termColumns)
      .from(terms)
      .where(
        inArray(
          terms.academicYearId,
          years.map((year) => year.id),
        ),
      )
      .orderBy(asc(terms.sequence));
    return years.map((year) => ({
      ...year,
      terms: allTerms.filter((term) => term.academicYearId === year.id),
    }));
  });
}

export async function createAcademicYear(
  db: Database,
  context: AccessContext,
  input: unknown,
): Promise<AcademicYearView> {
  requireConfigure(context);
  const data = academicYearInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [row] = await tx.insert(academicYears).values(data).returning(yearColumns);
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "academic_year.create",
      targetType: "academic_year",
      targetId: row.id,
      metadata: { name: row.name },
    });
    return { ...row, terms: [] };
  }).catch(translate);
}

export async function updateAcademicYear(
  db: Database,
  context: AccessContext,
  yearId: string,
  input: unknown,
): Promise<boolean> {
  requireConfigure(context);
  if (!uuid.safeParse(yearId).success) return false;
  const data = academicYearInput.parse(input);
  return withAccess(db, context, async (tx) => {
    // Existing terms must still fit inside the new dates.
    const [outside] = await tx
      .select({ id: terms.id })
      .from(terms)
      .where(
        and(
          eq(terms.academicYearId, yearId),
          sql`(${terms.startsOn} < ${data.startsOn} or ${terms.endsOn} > ${data.endsOn})`,
        ),
      )
      .limit(1);
    if (outside) {
      throw new AcademicConflictError("Some terms fall outside these dates.", "startsOn");
    }
    const [row] = await tx
      .update(academicYears)
      .set(data)
      .where(eq(academicYears.id, yearId))
      .returning({ id: academicYears.id });
    if (!row) return false;
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "academic_year.update",
      targetType: "academic_year",
      targetId: row.id,
      metadata: { fields: Object.keys(data).sort() },
    });
    return true;
  }).catch(translate);
}

/** Mark one active year as the current year; the previous current year is unmarked. */
export async function setCurrentAcademicYear(
  db: Database,
  context: AccessContext,
  yearId: string,
): Promise<boolean> {
  requireConfigure(context);
  if (!uuid.safeParse(yearId).success) return false;
  return withAccess(db, context, async (tx) => {
    const [year] = await tx
      .select({ status: academicYears.status })
      .from(academicYears)
      .where(eq(academicYears.id, yearId))
      .limit(1);
    if (!year) return false;
    if (year.status === "archived") {
      throw new AcademicConflictError("Restore this year before making it current.", "form");
    }
    await tx
      .update(academicYears)
      .set({ isCurrent: false })
      .where(and(eq(academicYears.isCurrent, true), ne(academicYears.id, yearId)));
    await tx.update(academicYears).set({ isCurrent: true }).where(eq(academicYears.id, yearId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "academic_year.set_current",
      targetType: "academic_year",
      targetId: yearId,
    });
    return true;
  }).catch(translate);
}

export async function setAcademicYearStatus(
  db: Database,
  context: AccessContext,
  yearId: string,
  status: RecordStatus,
): Promise<boolean> {
  requireConfigure(context);
  if (!uuid.safeParse(yearId).success) return false;
  return withAccess(db, context, async (tx) => {
    const [year] = await tx
      .select({ isCurrent: academicYears.isCurrent })
      .from(academicYears)
      .where(eq(academicYears.id, yearId))
      .limit(1);
    if (!year) return false;
    if (status === "archived" && year.isCurrent) {
      throw new AcademicConflictError(
        "The current year cannot be archived. Make another year current first.",
        "form",
      );
    }
    await tx.update(academicYears).set({ status }).where(eq(academicYears.id, yearId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: status === "archived" ? "academic_year.archive" : "academic_year.restore",
      targetType: "academic_year",
      targetId: yearId,
    });
    return true;
  });
}

export async function createTerm(
  db: Database,
  context: AccessContext,
  yearId: string,
  input: unknown,
): Promise<TermView | null> {
  requireConfigure(context);
  if (!uuid.safeParse(yearId).success) return null;
  const data = termInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [year] = await tx
      .select({ status: academicYears.status })
      .from(academicYears)
      .where(eq(academicYears.id, yearId))
      .limit(1);
    if (!year) return null;
    if (year.status === "archived") {
      throw new AcademicConflictError("This year is archived. Restore it to add terms.", "form");
    }
    const [row] = await tx
      .insert(terms)
      .values({ ...data, academicYearId: yearId })
      .returning(termColumns);
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "term.create",
      targetType: "term",
      targetId: row.id,
      metadata: { academicYearId: yearId, name: row.name },
    });
    return row;
  }).catch(translate);
}

export async function updateTerm(
  db: Database,
  context: AccessContext,
  termId: string,
  input: unknown,
): Promise<boolean> {
  requireConfigure(context);
  if (!uuid.safeParse(termId).success) return false;
  const data = termInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .update(terms)
      .set(data)
      .where(eq(terms.id, termId))
      .returning({ id: terms.id });
    if (!row) return false;
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "term.update",
      targetType: "term",
      targetId: row.id,
      metadata: { fields: Object.keys(data).sort() },
    });
    return true;
  }).catch(translate);
}

export async function setTermStatus(
  db: Database,
  context: AccessContext,
  termId: string,
  status: RecordStatus,
): Promise<boolean> {
  requireConfigure(context);
  if (!uuid.safeParse(termId).success) return false;
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .update(terms)
      .set({ status })
      .where(eq(terms.id, termId))
      .returning({ id: terms.id });
    if (!row) return false;
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: status === "archived" ? "term.archive" : "term.restore",
      targetType: "term",
      targetId: row.id,
    });
    return true;
  });
}

// ---------------------------------------------------------------- grade levels

export async function listGradeLevels(
  db: Database,
  context: AccessContext,
): Promise<GradeLevelView[]> {
  requirePermission(context, "academics.read");
  return withAccess(db, context, (tx) =>
    tx
      .select(gradeColumns)
      .from(gradeLevels)
      .orderBy(asc(gradeLevels.sortOrder), asc(gradeLevels.name))
      .limit(200),
  );
}

export async function createGradeLevel(
  db: Database,
  context: AccessContext,
  input: unknown,
): Promise<GradeLevelView> {
  requireConfigure(context);
  const data = gradeLevelInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [row] = await tx.insert(gradeLevels).values(data).returning(gradeColumns);
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "grade_level.create",
      targetType: "grade_level",
      targetId: row.id,
      metadata: { code: row.code },
    });
    return row;
  }).catch(translate);
}

export async function updateGradeLevel(
  db: Database,
  context: AccessContext,
  gradeId: string,
  input: unknown,
): Promise<boolean> {
  requireConfigure(context);
  if (!uuid.safeParse(gradeId).success) return false;
  const data = gradeLevelInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .update(gradeLevels)
      .set(data)
      .where(eq(gradeLevels.id, gradeId))
      .returning({ id: gradeLevels.id });
    if (!row) return false;
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "grade_level.update",
      targetType: "grade_level",
      targetId: row.id,
      metadata: { fields: Object.keys(data).sort() },
    });
    return true;
  }).catch(translate);
}

export async function setGradeLevelStatus(
  db: Database,
  context: AccessContext,
  gradeId: string,
  status: RecordStatus,
): Promise<boolean> {
  requireConfigure(context);
  if (!uuid.safeParse(gradeId).success) return false;
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .update(gradeLevels)
      .set({ status })
      .where(eq(gradeLevels.id, gradeId))
      .returning({ id: gradeLevels.id });
    if (!row) return false;
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: status === "archived" ? "grade_level.archive" : "grade_level.restore",
      targetType: "grade_level",
      targetId: row.id,
    });
    return true;
  });
}

// ---------------------------------------------------------------- classes and sections

/** Branches in the caller's scope; branch staff never see other branches' classes. */
function classScope(context: AccessContext): SQL | undefined {
  if (context.scope.kind === "school") return undefined;
  if (context.scope.branchIds.length === 0) return sql`false`;
  return inArray(classes.branchId, [...context.scope.branchIds]);
}

function requireClassManagement(context: AccessContext, branchId: string): void {
  requirePermission(context, "classes.manage");
  if (!canAccessBranch(context, branchId)) throw new ForbiddenError();
}

/**
 * Classes with their sections. Filters are optional; a branch outside the caller's scope
 * simply returns nothing.
 */
export async function listClasses(
  db: Database,
  context: AccessContext,
  filter: { branchId?: string | null; academicYearId?: string | null; classId?: string } = {},
): Promise<ClassView[]> {
  requirePermission(context, "academics.read");
  const branchId =
    filter.branchId && uuid.safeParse(filter.branchId).success ? filter.branchId : null;
  const yearId =
    filter.academicYearId && uuid.safeParse(filter.academicYearId).success
      ? filter.academicYearId
      : null;
  if (branchId && !canAccessBranch(context, branchId)) return [];
  return withAccess(db, context, async (tx) => {
    const rows = await tx
      .select({
        id: classes.id,
        branchId: classes.branchId,
        branchName: branches.name,
        academicYearId: classes.academicYearId,
        academicYearName: academicYears.name,
        gradeLevelId: classes.gradeLevelId,
        gradeLevelName: gradeLevels.name,
        name: classes.name,
        status: classes.status,
      })
      .from(classes)
      .innerJoin(branches, eq(branches.id, classes.branchId))
      .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
      .innerJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
      .where(
        and(
          classScope(context),
          branchId ? eq(classes.branchId, branchId) : undefined,
          yearId ? eq(classes.academicYearId, yearId) : undefined,
          filter.classId ? eq(classes.id, filter.classId) : undefined,
        ),
      )
      .orderBy(asc(branches.name), asc(gradeLevels.sortOrder), asc(classes.name))
      .limit(500);
    if (rows.length === 0) return [];
    const allSections = await tx
      .select(sectionColumns)
      .from(sections)
      .where(
        inArray(
          sections.classId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(sections.name));
    return rows.map((row) => ({
      ...row,
      sections: allSections.filter((section) => section.classId === row.id),
    }));
  });
}

/** One class in scope, or null — a class in another branch looks exactly like a missing one. */
export async function getClass(
  db: Database,
  context: AccessContext,
  classId: string,
): Promise<ClassView | null> {
  if (!uuid.safeParse(classId).success) return null;
  const [row] = await listClasses(db, context, { classId });
  return row ?? null;
}

export async function createClass(
  db: Database,
  context: AccessContext,
  input: unknown,
): Promise<{ id: string }> {
  const data = classInput.parse(input);
  requireClassManagement(context, data.branchId);
  return withAccess(db, context, async (tx) => {
    const [branch] = await tx
      .select({ status: branches.status })
      .from(branches)
      .where(eq(branches.id, data.branchId))
      .limit(1);
    if (!branch) throw new ForbiddenError();
    if (branch.status !== "active") {
      throw new AcademicConflictError("This branch is inactive.", "branchId");
    }
    const [year] = await tx
      .select({ status: academicYears.status })
      .from(academicYears)
      .where(eq(academicYears.id, data.academicYearId))
      .limit(1);
    if (!year || year.status !== "active") {
      throw new AcademicConflictError("Choose an active academic year.", "academicYearId");
    }
    const [grade] = await tx
      .select({ name: gradeLevels.name, status: gradeLevels.status })
      .from(gradeLevels)
      .where(eq(gradeLevels.id, data.gradeLevelId))
      .limit(1);
    if (!grade || grade.status !== "active") {
      throw new AcademicConflictError("Choose an active grade level.", "gradeLevelId");
    }
    const [row] = await tx
      .insert(classes)
      .values({ ...data, name: data.name ?? grade.name })
      .returning({ id: classes.id });
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "class.create",
      targetType: "class",
      targetId: row.id,
      branchId: data.branchId,
      metadata: { academicYearId: data.academicYearId, gradeLevelId: data.gradeLevelId },
    });
    return row;
  }).catch(translate);
}

/** Look up a class's branch through RLS: null when the class is outside the caller's scope. */
async function classBranch(
  db: Database,
  context: AccessContext,
  classId: string,
): Promise<string | null> {
  if (!uuid.safeParse(classId).success) return null;
  const [row] = await withAccess(db, context, (tx) =>
    tx
      .select({ branchId: classes.branchId })
      .from(classes)
      .where(and(classScope(context), eq(classes.id, classId)))
      .limit(1),
  );
  return row?.branchId ?? null;
}

export async function renameClass(
  db: Database,
  context: AccessContext,
  classId: string,
  name: unknown,
): Promise<boolean> {
  const branchId = await classBranch(db, context, classId);
  if (!branchId) return false;
  requireClassManagement(context, branchId);
  const value = z.string().trim().min(1, "Enter the class name.").max(80).parse(name);
  return withAccess(db, context, async (tx) => {
    await tx.update(classes).set({ name: value }).where(eq(classes.id, classId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "class.update",
      targetType: "class",
      targetId: classId,
      branchId,
      metadata: { fields: ["name"] },
    });
    return true;
  });
}

export async function setClassStatus(
  db: Database,
  context: AccessContext,
  classId: string,
  status: RecordStatus,
): Promise<boolean> {
  const branchId = await classBranch(db, context, classId);
  if (!branchId) return false;
  requireClassManagement(context, branchId);
  return withAccess(db, context, async (tx) => {
    await tx.update(classes).set({ status }).where(eq(classes.id, classId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: status === "archived" ? "class.archive" : "class.restore",
      targetType: "class",
      targetId: classId,
      branchId,
    });
    return true;
  });
}

export async function createSection(
  db: Database,
  context: AccessContext,
  classId: string,
  input: unknown,
): Promise<SectionView | null> {
  const branchId = await classBranch(db, context, classId);
  if (!branchId) return null;
  requireClassManagement(context, branchId);
  const data = sectionInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .insert(sections)
      .values({ ...data, classId, branchId })
      .returning(sectionColumns);
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "section.create",
      targetType: "section",
      targetId: row.id,
      branchId,
      metadata: { classId, name: row.name },
    });
    return row;
  }).catch(translate);
}

/** Look up a section's branch through RLS: null when it is outside the caller's scope. */
async function sectionBranch(
  db: Database,
  context: AccessContext,
  sectionId: string,
): Promise<string | null> {
  if (!uuid.safeParse(sectionId).success) return null;
  const [row] = await withAccess(db, context, (tx) =>
    tx
      .select({ branchId: sections.branchId })
      .from(sections)
      .where(eq(sections.id, sectionId))
      .limit(1),
  );
  if (!row || !canAccessBranch(context, row.branchId)) return null;
  return row.branchId;
}

export async function updateSection(
  db: Database,
  context: AccessContext,
  sectionId: string,
  input: unknown,
): Promise<boolean> {
  const branchId = await sectionBranch(db, context, sectionId);
  if (!branchId) return false;
  requireClassManagement(context, branchId);
  const data = sectionInput.parse(input);
  return withAccess(db, context, async (tx) => {
    await tx.update(sections).set(data).where(eq(sections.id, sectionId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "section.update",
      targetType: "section",
      targetId: sectionId,
      branchId,
      metadata: { fields: Object.keys(data).sort() },
    });
    return true;
  }).catch(translate);
}

export async function setSectionStatus(
  db: Database,
  context: AccessContext,
  sectionId: string,
  status: RecordStatus,
): Promise<boolean> {
  const branchId = await sectionBranch(db, context, sectionId);
  if (!branchId) return false;
  requireClassManagement(context, branchId);
  return withAccess(db, context, async (tx) => {
    await tx.update(sections).set({ status }).where(eq(sections.id, sectionId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: status === "archived" ? "section.archive" : "section.restore",
      targetType: "section",
      targetId: sectionId,
      branchId,
    });
    return true;
  });
}
