"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { AccessDeniedError, ForbiddenError } from "@/server/access/errors";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { AvatarValidationError } from "@/server/modules/profile/avatar-image";
import {
  removeSchoolLogo,
  setSchoolLogo,
  updateSchoolSettings,
} from "@/server/modules/settings/service";
import { getStorage } from "@/server/storage/object-storage";

export interface SettingsFormState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const text = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

function toState(error: unknown): SettingsFormState {
  if (error instanceof ZodError) {
    return {
      error: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
      ),
    };
  }
  if (error instanceof ForbiddenError || error instanceof AccessDeniedError) {
    return { error: "You do not have permission to change school settings." };
  }
  if (error instanceof AvatarValidationError) return { fieldErrors: { logo: error.message } };
  throw error;
}

export async function updateSettingsAction(
  _prev: SettingsFormState,
  data: FormData,
): Promise<SettingsFormState> {
  const { access } = await requireAccess();
  try {
    await updateSchoolSettings(getDatabase(), access, {
      name: text(data, "name"),
      shortName: text(data, "shortName"),
      timezone: text(data, "timezone"),
      email: text(data, "email"),
      phone: text(data, "phone"),
      address: text(data, "address"),
    });
  } catch (error) {
    return toState(error);
  }
  // The school name and timezone appear across every page.
  revalidatePath("/", "layout");
  return { message: "School profile saved." };
}

export async function uploadLogoAction(
  _prev: SettingsFormState,
  data: FormData,
): Promise<SettingsFormState> {
  const { access } = await requireAccess();
  const file = data.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { logo: "Choose an image file to upload." } };
  }
  try {
    // The filename and declared type are ignored; the bytes are decoded and checked.
    await setSchoolLogo(
      getDatabase(),
      getStorage(),
      access,
      new Uint8Array(await file.arrayBuffer()),
    );
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/", "layout");
  return { message: "Logo updated." };
}

export async function removeLogoAction(_prev: SettingsFormState): Promise<SettingsFormState> {
  const { access } = await requireAccess();
  try {
    await removeSchoolLogo(getDatabase(), getStorage(), access);
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/", "layout");
  return { message: "Logo removed." };
}
