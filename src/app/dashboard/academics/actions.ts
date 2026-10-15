"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { AccessDeniedError, ForbiddenError } from "@/server/access/errors";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import {
  AcademicConflictError,
  createAcademicYear,
  createClass,
  createGradeLevel,
  createSection,
  createTerm,
  renameClass,
  setAcademicYearStatus,
  setClassStatus,
  setCurrentAcademicYear,
  setGradeLevelStatus,
  setSectionStatus,
  setTermStatus,
  updateAcademicYear,
  updateGradeLevel,
  updateSection,
  type RecordStatus,
} from "@/server/modules/academics/service";

export interface AcademicFormState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const GONE = "This record is no longer available to you.";

/** Text fields from a form, minus framework fields (e.g. "$ACTION_ID_…") and hidden IDs. */
function fieldsFrom(data: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => {
      const value = data.get(name);
      return [name, typeof value === "string" ? value : ""];
    }),
  );
}

function text(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function status(data: FormData): RecordStatus {
  return data.get("status") === "archived" ? "archived" : "active";
}

function toState(error: unknown, values?: Record<string, string>): AcademicFormState {
  if (error instanceof ZodError) {
    return {
      values,
      error: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
      ),
    };
  }
  if (error instanceof AcademicConflictError) {
    if (error.field === "form") return { values, error: error.message };
    return {
      values,
      error: "Check the highlighted fields.",
      fieldErrors: { [error.field]: error.message },
    };
  }
  if (error instanceof ForbiddenError || error instanceof AccessDeniedError) {
    return { values, error: "You do not have permission to make this change." };
  }
  throw error;
}

/** Run a change; report failures as form state, success as a message. */
async function run(
  change: () => Promise<boolean | object | null>,
  message: string,
  values?: Record<string, string>,
): Promise<AcademicFormState> {
  try {
    const result = await change();
    if (!result) return { values, error: GONE };
  } catch (error) {
    return toState(error, values);
  }
  revalidatePath("/dashboard/academics", "layout");
  return { message };
}

// ---------------------------------------------------------------- years and terms

const YEAR_FIELDS = ["name", "startsOn", "endsOn"] as const;
const TERM_FIELDS = ["name", "sequence", "startsOn", "endsOn"] as const;

export async function createYearAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, YEAR_FIELDS);
  let id: string;
  try {
    id = (await createAcademicYear(getDatabase(), access, values)).id;
  } catch (error) {
    return toState(error, values);
  }
  revalidatePath("/dashboard/academics", "layout");
  redirect(`/dashboard/academics/years/${id}?created=1`);
}

export async function updateYearAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, YEAR_FIELDS);
  return run(
    () => updateAcademicYear(getDatabase(), access, text(data, "yearId"), values),
    "Academic year saved.",
    values,
  );
}

export async function setCurrentYearAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  return run(
    () => setCurrentAcademicYear(getDatabase(), access, text(data, "yearId")),
    "This is now the current academic year.",
  );
}

export async function setYearStatusAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const next = status(data);
  return run(
    () => setAcademicYearStatus(getDatabase(), access, text(data, "yearId"), next),
    next === "archived" ? "Academic year archived." : "Academic year restored.",
  );
}

export async function createTermAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, TERM_FIELDS);
  return run(
    () => createTerm(getDatabase(), access, text(data, "yearId"), values),
    "Term added.",
    values,
  );
}

export async function setTermStatusAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const next = status(data);
  return run(
    () => setTermStatus(getDatabase(), access, text(data, "termId"), next),
    next === "archived" ? "Term archived." : "Term restored.",
  );
}

// ---------------------------------------------------------------- grade levels

const GRADE_FIELDS = ["name", "code", "sortOrder"] as const;

export async function createGradeAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, GRADE_FIELDS);
  return run(() => createGradeLevel(getDatabase(), access, values), "Grade level added.", values);
}

export async function updateGradeAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, GRADE_FIELDS);
  return run(
    () => updateGradeLevel(getDatabase(), access, text(data, "gradeId"), values),
    "Grade level saved.",
    values,
  );
}

export async function setGradeStatusAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const next = status(data);
  return run(
    () => setGradeLevelStatus(getDatabase(), access, text(data, "gradeId"), next),
    next === "archived" ? "Grade level archived." : "Grade level restored.",
  );
}

// ---------------------------------------------------------------- classes and sections

const CLASS_FIELDS = ["branchId", "academicYearId", "gradeLevelId", "name"] as const;
const SECTION_FIELDS = ["name", "capacity", "room"] as const;

export async function createClassAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, CLASS_FIELDS);
  let id: string;
  try {
    id = (await createClass(getDatabase(), access, values)).id;
  } catch (error) {
    return toState(error, values);
  }
  revalidatePath("/dashboard/academics", "layout");
  redirect(`/dashboard/academics/classes/${id}?created=1`);
}

export async function renameClassAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, ["name"]);
  return run(
    () => renameClass(getDatabase(), access, text(data, "classId"), values.name),
    "Class name saved.",
    values,
  );
}

export async function setClassStatusAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const next = status(data);
  return run(
    () => setClassStatus(getDatabase(), access, text(data, "classId"), next),
    next === "archived" ? "Class archived." : "Class restored.",
  );
}

export async function createSectionAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, SECTION_FIELDS);
  return run(
    () => createSection(getDatabase(), access, text(data, "classId"), values),
    "Section added.",
    values,
  );
}

export async function updateSectionAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data, SECTION_FIELDS);
  return run(
    () => updateSection(getDatabase(), access, text(data, "sectionId"), values),
    "Section saved.",
    values,
  );
}

export async function setSectionStatusAction(
  _prev: AcademicFormState,
  data: FormData,
): Promise<AcademicFormState> {
  const { access } = await requireAccess();
  const next = status(data);
  return run(
    () => setSectionStatus(getDatabase(), access, text(data, "sectionId"), next),
    next === "archived" ? "Section archived." : "Section restored.",
  );
}
