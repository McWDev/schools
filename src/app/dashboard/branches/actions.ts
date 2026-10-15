"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { AccessDeniedError, ForbiddenError } from "@/server/access/errors";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import {
  createBranch,
  DuplicateBranchCodeError,
  setBranchStatus,
  updateBranch,
} from "@/server/modules/branches/service";

export interface BranchFormState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const FIELDS = ["name", "code", "area", "address", "phone", "email"] as const;

function fieldsFrom(data: FormData): Record<string, string> {
  return Object.fromEntries(
    FIELDS.map((name) => {
      const value = data.get(name);
      return [name, typeof value === "string" ? value : ""];
    }),
  );
}

function toState(error: unknown, values?: Record<string, string>): BranchFormState {
  if (error instanceof ZodError) {
    return {
      values,
      error: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
      ),
    };
  }
  if (error instanceof DuplicateBranchCodeError) {
    return { values, fieldErrors: { code: error.message }, error: "Check the highlighted fields." };
  }
  if (error instanceof ForbiddenError || error instanceof AccessDeniedError) {
    return { values, error: "Only school-wide administrators can manage branches." };
  }
  throw error;
}

export async function createBranchAction(
  _prev: BranchFormState,
  data: FormData,
): Promise<BranchFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data);
  let id: string;
  try {
    id = (await createBranch(getDatabase(), access, values)).id;
  } catch (error) {
    return toState(error, values);
  }
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/branches/${id}?created=1`);
}

export async function updateBranchAction(
  _prev: BranchFormState,
  data: FormData,
): Promise<BranchFormState> {
  const { access } = await requireAccess();
  const values = fieldsFrom(data);
  const branchId = data.get("branchId");
  try {
    const branch = await updateBranch(
      getDatabase(),
      access,
      typeof branchId === "string" ? branchId : "",
      values,
    );
    if (!branch) return { error: "This branch is no longer available to you." };
  } catch (error) {
    return toState(error, values);
  }
  revalidatePath("/dashboard", "layout");
  return { message: "Branch details saved." };
}

export async function setBranchStatusAction(
  _prev: BranchFormState,
  data: FormData,
): Promise<BranchFormState> {
  const { access } = await requireAccess();
  const branchId = data.get("branchId");
  const status = data.get("status") === "active" ? "active" : "inactive";
  try {
    const branch = await setBranchStatus(
      getDatabase(),
      access,
      typeof branchId === "string" ? branchId : "",
      status,
    );
    if (!branch) return { error: "This branch is no longer available to you." };
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/dashboard", "layout");
  return { message: status === "active" ? "Branch reopened." : "Branch deactivated." };
}
