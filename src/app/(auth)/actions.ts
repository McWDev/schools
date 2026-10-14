"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { AuthValidationError } from "@/server/auth/errors";
import { acceptInvitation } from "@/server/auth/invitations";
import { login } from "@/server/auth/login";
import { requestPasswordReset, resetPassword } from "@/server/auth/password-reset";
import {
  clearSessionCookie,
  getClientIp,
  getUserAgent,
  readSessionToken,
  setSessionCookie,
} from "@/server/auth/request";
import { revokeSessionByToken } from "@/server/auth/sessions";
import { getDatabase } from "@/server/db/client";
import { getMailer } from "@/server/email/mailer";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  /** Non-secret values to re-fill after a failed submission. Never includes passwords. */
  values?: { email?: string };
}

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

const loginInput = z.object({
  email: z.string().trim().min(1, "Enter your email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(1024),
});

export async function loginAction(_prev: FormState, data: FormData): Promise<FormState> {
  const parsed = loginInput.safeParse({
    email: field(data, "email"),
    password: field(data, "password"),
  });
  const values = { email: field(data, "email").slice(0, 254) };
  if (!parsed.success) {
    return {
      values,
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
      ),
    };
  }

  const result = await login(getDatabase(), {
    ...parsed.data,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  if (!result.ok) {
    if (result.reason === "rate_limited") {
      const minutes = Math.ceil(result.retryAfterSeconds / 60);
      return {
        values,
        error: `Too many sign-in attempts. Try again in about ${minutes} minute(s).`,
      };
    }
    return { values, error: "The email or password is incorrect." };
  }

  await setSessionCookie(result.token);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await revokeSessionByToken(getDatabase(), token);
  await clearSessionCookie();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: FormState, data: FormData): Promise<FormState> {
  const email = field(data, "email").trim();
  if (!email) return { fieldErrors: { email: "Enter your email address." } };

  const ip = await getClientIp();
  const appUrl = env().APP_URL;
  // Run after the response is sent, so timing never reveals whether the account exists.
  after(async () => {
    try {
      await requestPasswordReset(getDatabase(), getMailer(), { email, ip, appUrl });
    } catch (error) {
      console.error("password reset request failed", { name: (error as Error).name });
    }
  });
  return {
    message:
      "If an account exists for that email, we have sent a link to reset the password. Check your inbox.",
  };
}

export async function resetPasswordAction(_prev: FormState, data: FormData): Promise<FormState> {
  const password = field(data, "password");
  if (password !== field(data, "confirmPassword")) {
    return { fieldErrors: { confirmPassword: "The passwords do not match." } };
  }
  try {
    const result = await resetPassword(getDatabase(), {
      token: field(data, "token"),
      newPassword: password,
      ip: await getClientIp(),
    });
    if (!result.ok) {
      return {
        error:
          result.reason === "rate_limited"
            ? "Too many attempts. Please wait a few minutes and try again."
            : "This reset link is invalid or has expired. Request a new one.",
      };
    }
  } catch (error) {
    if (error instanceof AuthValidationError) return { fieldErrors: { password: error.message } };
    throw error;
  }
  redirect("/login?reset=1");
}

export async function acceptInvitationAction(_prev: FormState, data: FormData): Promise<FormState> {
  const password = field(data, "password");
  if (password !== field(data, "confirmPassword")) {
    return { fieldErrors: { confirmPassword: "The passwords do not match." } };
  }
  try {
    const result = await acceptInvitation(getDatabase(), {
      token: field(data, "token"),
      password,
      ip: await getClientIp(),
    });
    if (!result.ok) {
      const messages = {
        rate_limited: "Too many attempts. Please wait a few minutes and try again.",
        already_active: "Your account is already set up. Sign in with your password.",
        invalid_token: "This invitation link is invalid or has expired. Ask for a new one.",
      } as const;
      return { error: messages[result.reason] };
    }
  } catch (error) {
    if (error instanceof AuthValidationError) return { fieldErrors: { password: error.message } };
    throw error;
  }
  redirect("/login?activated=1");
}
