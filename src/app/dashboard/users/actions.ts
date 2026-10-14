"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { env } from "@/lib/env";
import { confirmPassword, hasRecentAuthentication } from "@/server/auth/reauth";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getMailer } from "@/server/email/mailer";
import { AccessDeniedError, ConflictError, ForbiddenError } from "@/server/access/errors";
import {
  inviteStaff,
  resendInvitation,
  setStaffAccess,
  setStaffRoles,
  setStaffStatus,
  updateStaffProfile,
} from "@/server/modules/users/service";

export interface UserFormState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  needsPassword?: boolean;
  /** Non-secret values to re-fill after a failed submission. */
  values?: { email?: string; displayName?: string };
}

const text = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};
const list = (data: FormData, name: string) =>
  data.getAll(name).filter((v): v is string => typeof v === "string" && v.length > 0);

function accessFrom(data: FormData) {
  return text(data, "scope") === "school"
    ? { scope: "school" as const }
    : { scope: "branch" as const, branchIds: list(data, "branchIds") };
}

/** Map service errors to messages that are safe to show. Unknown errors are re-thrown. */
function toState(error: unknown): UserFormState {
  if (error instanceof ZodError) {
    return {
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
      ),
      error: "Check the highlighted fields.",
    };
  }
  if (error instanceof ForbiddenError || error instanceof ConflictError)
    return { error: error.message };
  if (error instanceof AccessDeniedError)
    return { error: "Your access has changed. Reload the page." };
  throw error;
}

/** High-risk changes need the password entered within the last 10 minutes. */
async function ensureRecentAuth(session: { sessionId: string; userId: string }, data: FormData) {
  const db = getDatabase();
  if (await hasRecentAuthentication(db, session.sessionId)) return true;
  const password = text(data, "currentPassword");
  return password.length > 0 && (await confirmPassword(db, session, password));
}

const needPassword: UserFormState = {
  needsPassword: true,
  fieldErrors: { currentPassword: "Enter your password to confirm this change." },
  error: "For your security, confirm your password to continue.",
};

export async function inviteAction(_prev: UserFormState, data: FormData): Promise<UserFormState> {
  const { access } = await requireAccess();
  let userId: string;
  try {
    const result = await inviteStaff(
      getDatabase(),
      access,
      getMailer(),
      {
        email: text(data, "email"),
        displayName: text(data, "displayName"),
        access: accessFrom(data),
        roleIds: list(data, "roleIds"),
      },
      env().APP_URL,
    );
    userId = result.userId;
  } catch (error) {
    return {
      ...toState(error),
      values: { email: text(data, "email"), displayName: text(data, "displayName") },
    };
  }
  revalidatePath("/dashboard/users");
  redirect(`/dashboard/users/${userId}?invited=1`);
}

export async function updateRolesAction(
  _prev: UserFormState,
  data: FormData,
): Promise<UserFormState> {
  const { session, access } = await requireAccess();
  if (!(await ensureRecentAuth(session, data))) return needPassword;
  try {
    const member = await setStaffRoles(
      getDatabase(),
      access,
      text(data, "userId"),
      list(data, "roleIds"),
    );
    if (!member) return { error: "This person is no longer in your scope." };
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/dashboard/users");
  return { message: "Roles updated." };
}

export async function updateAccessAction(
  _prev: UserFormState,
  data: FormData,
): Promise<UserFormState> {
  const { session, access } = await requireAccess();
  if (!(await ensureRecentAuth(session, data))) return needPassword;
  let stillVisible = true;
  try {
    stillVisible = !!(await setStaffAccess(
      getDatabase(),
      access,
      text(data, "userId"),
      accessFrom(data),
    ));
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/dashboard/users");
  if (!stillVisible) redirect("/dashboard/users?moved=1");
  return { message: "Branch access updated." };
}

export async function updateStatusAction(
  _prev: UserFormState,
  data: FormData,
): Promise<UserFormState> {
  const { session, access } = await requireAccess();
  if (!(await ensureRecentAuth(session, data))) return needPassword;
  const status = text(data, "status") === "active" ? "active" : "deactivated";
  try {
    const member = await setStaffStatus(getDatabase(), access, text(data, "userId"), status);
    if (!member) return { error: "This person is no longer in your scope." };
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/dashboard/users");
  return { message: status === "active" ? "Access restored." : "Access removed." };
}

export async function updateProfileAction(
  _prev: UserFormState,
  data: FormData,
): Promise<UserFormState> {
  const { access } = await requireAccess();
  try {
    const member = await updateStaffProfile(getDatabase(), access, text(data, "userId"), {
      displayName: text(data, "displayName"),
    });
    if (!member) return { error: "This person is no longer in your scope." };
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/dashboard/users");
  return { message: "Details saved." };
}

export async function resendInvitationAction(
  _prev: UserFormState,
  data: FormData,
): Promise<UserFormState> {
  const { access } = await requireAccess();
  try {
    const sent = await resendInvitation(
      getDatabase(),
      access,
      getMailer(),
      text(data, "userId"),
      env().APP_URL,
    );
    return sent
      ? { message: "A new invitation link was sent. Earlier links no longer work." }
      : { error: "This invitation cannot be resent." };
  } catch (error) {
    return toState(error);
  }
}
