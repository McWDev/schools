"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { AccessDeniedError, ForbiddenError } from "@/server/access/errors";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { AvatarValidationError } from "@/server/modules/profile/avatar-image";
import {
  addGuardian,
  admitStudent,
  placeStudent,
  PossibleDuplicateError,
  removeStudentPhoto,
  setStudentPhoto,
  setStudentStatus,
  StudentRuleError,
  transferStudent,
  updateStudent,
} from "@/server/modules/students/service";
import { getStorage } from "@/server/storage/object-storage";

export interface StudentFormState {
  error?: string;
  message?: string;
  /** Set when admission matched existing students; the form then asks for confirmation. */
  duplicate?: string;
  /** Keyed by field path, e.g. "firstName" or "guardian.phone". */
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const GONE = "This student is no longer available to you.";

function fields(data: FormData, names: readonly string[]): Record<string, string> {
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

function toState(error: unknown, values?: Record<string, string>): StudentFormState {
  if (error instanceof ZodError) {
    return {
      values,
      error: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
      ),
    };
  }
  if (error instanceof StudentRuleError) {
    return {
      values,
      error: "Check the highlighted fields.",
      fieldErrors: { [error.field]: error.message },
    };
  }
  if (error instanceof AvatarValidationError) {
    return {
      values,
      error: "Check the highlighted fields.",
      fieldErrors: { photo: error.message },
    };
  }
  if (error instanceof PossibleDuplicateError) {
    return { values, duplicate: error.message };
  }
  if (error instanceof ForbiddenError || error instanceof AccessDeniedError) {
    return { values, error: "You do not have permission to make this change." };
  }
  throw error;
}

async function run(
  change: () => Promise<boolean>,
  message: string,
  values?: Record<string, string>,
): Promise<StudentFormState> {
  try {
    if (!(await change())) return { values, error: GONE };
  } catch (error) {
    return toState(error, values);
  }
  revalidatePath("/dashboard/students", "layout");
  return { message };
}

const PERSON_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "dateOfBirth",
  "gender",
  "previousSchool",
  "phone",
  "address",
  "medicalNotes",
] as const;
const ADMISSION_FIELDS = [
  ...PERSON_FIELDS,
  "branchId",
  "sectionId",
  "admissionDate",
  "guardianFullName",
  "guardianRelationship",
  "guardianPhone",
  "guardianEmail",
] as const;
const GUARDIAN_FIELDS = ["fullName", "relationship", "phone", "email"] as const;

/** Sensitive inputs are only rendered for permitted users; absent fields stay untouched. */
function present(data: FormData, values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([name]) => data.has(name)));
}

export async function admitStudentAction(
  _prev: StudentFormState,
  data: FormData,
): Promise<StudentFormState> {
  const { access } = await requireAccess();
  const values = fields(data, ADMISSION_FIELDS);
  const { guardianFullName, guardianRelationship, guardianPhone, guardianEmail, ...student } =
    present(data, values);
  let result: { id: string };
  try {
    // The photo is optional. Its filename and declared type are ignored; the bytes are checked.
    const file = data.get("photo");
    const photo =
      file instanceof File && file.size > 0
        ? { storage: getStorage(), bytes: new Uint8Array(await file.arrayBuffer()) }
        : undefined;
    result = await admitStudent(
      getDatabase(),
      access,
      {
        ...student,
        guardian: {
          fullName: guardianFullName ?? "",
          relationship: guardianRelationship ?? "",
          ...(guardianPhone !== undefined ? { phone: guardianPhone } : {}),
          ...(guardianEmail !== undefined ? { email: guardianEmail } : {}),
        },
        confirmDuplicate: data.get("confirmDuplicate") === "on",
      },
      photo,
    );
  } catch (error) {
    return toState(error, values);
  }
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/students/${result.id}?admitted=1`);
}

export async function updateStudentAction(
  _prev: StudentFormState,
  data: FormData,
): Promise<StudentFormState> {
  const { access } = await requireAccess();
  const values = present(data, fields(data, PERSON_FIELDS));
  return run(
    () => updateStudent(getDatabase(), access, text(data, "studentId"), values),
    "Student details saved.",
    values,
  );
}

export async function placeStudentAction(
  _prev: StudentFormState,
  data: FormData,
): Promise<StudentFormState> {
  const { access } = await requireAccess();
  return run(
    () => placeStudent(getDatabase(), access, text(data, "studentId"), text(data, "sectionId")),
    "Class placement saved.",
  );
}

export async function setStudentStatusAction(
  _prev: StudentFormState,
  data: FormData,
): Promise<StudentFormState> {
  const { access } = await requireAccess();
  return run(
    () => setStudentStatus(getDatabase(), access, text(data, "studentId"), text(data, "status")),
    "Status saved.",
  );
}

export async function addGuardianAction(
  _prev: StudentFormState,
  data: FormData,
): Promise<StudentFormState> {
  const { access } = await requireAccess();
  const values = present(data, fields(data, GUARDIAN_FIELDS));
  return run(
    () => addGuardian(getDatabase(), access, text(data, "studentId"), values),
    "Guardian added.",
    values,
  );
}

export async function transferStudentAction(
  _prev: StudentFormState,
  data: FormData,
): Promise<StudentFormState> {
  const { access } = await requireAccess();
  const values = fields(data, ["toBranchId", "effectiveOn", "reason"]);
  const studentId = text(data, "studentId");
  try {
    if (!(await transferStudent(getDatabase(), access, studentId, values))) {
      return { values, error: GONE };
    }
  } catch (error) {
    return toState(error, values);
  }
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/students/${studentId}?transferred=1`);
}

export async function uploadStudentPhotoAction(
  _prev: StudentFormState,
  data: FormData,
): Promise<StudentFormState> {
  const { access } = await requireAccess();
  const file = data.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { photo: "Choose an image file to upload." } };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return run(
    () =>
      setStudentPhoto(getDatabase(), access, text(data, "studentId"), {
        storage: getStorage(),
        bytes,
      }),
    "Photo updated.",
  );
}

export async function removeStudentPhotoAction(
  _prev: StudentFormState,
  data: FormData,
): Promise<StudentFormState> {
  const { access } = await requireAccess();
  return run(
    () => removeStudentPhoto(getDatabase(), access, getStorage(), text(data, "studentId")),
    "Photo removed.",
  );
}
