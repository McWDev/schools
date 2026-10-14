"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { env } from "@/lib/env";
import { confirmPassword, hasRecentAuthentication } from "@/server/auth/reauth";
import { requireTenantRequest } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getMailer } from "@/server/email/mailer";
import {
  inviteMember,
  resendInvitation,
  setMemberAccess,
  setMemberRoles,
  setMemberStatus,
  updateMemberProfile,
} from "@/server/modules/users/service";
import { ConflictError, ForbiddenError, TenantAccessError } from "@/server/tenancy/errors";

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
  if (error instanceof TenantAccessError)
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
  const { context } = await requireTenantRequest();
  let membershipId: string;
  try {
    const result = await inviteMember(
      getDatabase(),
      context,
      getMailer(),
      {
        email: text(data, "email"),
        displayName: text(data, "displayName"),
        access: accessFrom(data),
        roleIds: list(data, "roleIds"),
      },
      env().APP_URL,
    );
    membershipId = result.membershipId;
  } catch (error) {
    return {
      ...toState(error),
      values: { email: text(data, "email"), displayName: text(data, "displayName") },
    };
  }
  revalidatePath("/dashboard/users");
  redirect(`/dashboard/users/${membershipId}?invited=1`);
}

export async function updateRolesAction(
  _prev: UserFormState,
  data: FormData,
): Promise<UserFormState> {
  const { session, context } = await requireTenantRequest();
  if (!(await ensureRecentAuth(session, data))) return needPassword;
  try {
    const member = await setMemberRoles(
      getDatabase(),
      context,
      text(data, "membershipId"),
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
  const { session, context } = await requireTenantRequest();
  if (!(await ensureRecentAuth(session, data))) return needPassword;
  try {
    const member = await setMemberAccess(
      getDatabase(),
      context,
      text(data, "membershipId"),
      accessFrom(data),
    );
    if (!member) {
      revalidatePath("/dashboard/users");
      redirect("/dashboard/users?moved=1");
    }
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/dashboard/users");
  return { message: "Branch access updated." };
}

export async function updateStatusAction(
  _prev: UserFormState,
  data: FormData,
): Promise<UserFormState> {
  const { session, context } = await requireTenantRequest();
  if (!(await ensureRecentAuth(session, data))) return needPassword;
  const status = text(data, "status") === "active" ? "active" : "suspended";
  try {
    const member = await setMemberStatus(
      getDatabase(),
      context,
      text(data, "membershipId"),
      status,
    );
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
  const { context } = await requireTenantRequest();
  try {
    const member = await updateMemberProfile(getDatabase(), context, text(data, "membershipId"), {
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
  const { context } = await requireTenantRequest();
  try {
    const sent = await resendInvitation(
      getDatabase(),
      context,
      getMailer(),
      text(data, "membershipId"),
      env().APP_URL,
    );
    return sent
      ? { message: "A new invitation link was sent. Earlier links no longer work." }
      : { error: "This invitation cannot be resent." };
  } catch (error) {
    return toState(error);
  }
}
