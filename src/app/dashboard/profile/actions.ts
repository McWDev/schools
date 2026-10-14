"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { AuthValidationError } from "@/server/auth/errors";
import { requireSession } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { AvatarValidationError } from "@/server/modules/profile/avatar-image";
import {
  changeOwnPassword,
  removeOwnAvatar,
  setOwnAvatar,
  updateOwnDisplayName,
} from "@/server/modules/profile/service";
import { getStorage } from "@/server/storage/object-storage";

export interface ProfileFormState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const text = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

export async function updateNameAction(
  _prev: ProfileFormState,
  data: FormData,
): Promise<ProfileFormState> {
  const session = await requireSession();
  try {
    await updateOwnDisplayName(getDatabase(), session.userId, {
      displayName: text(data, "displayName"),
    });
  } catch (error) {
    if (error instanceof ZodError) return { fieldErrors: { displayName: error.issues[0].message } };
    throw error;
  }
  revalidatePath("/dashboard", "layout");
  return { message: "Your name was updated." };
}

export async function uploadAvatarAction(
  _prev: ProfileFormState,
  data: FormData,
): Promise<ProfileFormState> {
  const session = await requireSession();
  const file = data.get("photo");
  if (!(file instanceof File) || file.size === 0)
    return { fieldErrors: { photo: "Choose an image file to upload." } };
  try {
    // The filename and declared type are ignored; the bytes are decoded and checked.
    await setOwnAvatar(
      getDatabase(),
      getStorage(),
      session.userId,
      new Uint8Array(await file.arrayBuffer()),
    );
  } catch (error) {
    if (error instanceof AvatarValidationError) return { fieldErrors: { photo: error.message } };
    throw error;
  }
  revalidatePath("/dashboard", "layout");
  return { message: "Your photo was updated." };
}

export async function removeAvatarAction(_prev: ProfileFormState): Promise<ProfileFormState> {
  const session = await requireSession();
  await removeOwnAvatar(getDatabase(), getStorage(), session.userId);
  revalidatePath("/dashboard", "layout");
  return { message: "Your photo was removed." };
}

export async function changePasswordAction(
  _prev: ProfileFormState,
  data: FormData,
): Promise<ProfileFormState> {
  const session = await requireSession();
  const newPassword = text(data, "newPassword");
  if (newPassword !== text(data, "confirmPassword")) {
    return { fieldErrors: { confirmPassword: "The new passwords do not match." } };
  }
  try {
    const result = await changeOwnPassword(getDatabase(), session, {
      currentPassword: text(data, "currentPassword"),
      newPassword,
    });
    if (!result.ok) {
      return result.reason === "rate_limited"
        ? { error: "Too many attempts. Wait a few minutes and try again." }
        : { fieldErrors: { currentPassword: "Your current password is incorrect." } };
    }
  } catch (error) {
    if (error instanceof AuthValidationError)
      return { fieldErrors: { newPassword: error.message } };
    throw error;
  }
  return { message: "Password changed. You were signed out on your other devices." };
}
