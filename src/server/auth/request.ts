import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { env } from "@/lib/env";
import { resolveBranchFilter, type BranchOption } from "@/server/access/branch-filter";
import { resolveAccessContext, type AccessContext } from "@/server/access/context";
import { AccessDeniedError } from "@/server/access/errors";
import { getSchoolProfile, type SchoolProfile } from "@/server/access/school";
import { getDatabase } from "@/server/db/client";

import { AUTH_POLICY } from "./config";
import { setSessionBranch, validateSession, type SessionUser } from "./sessions";

/** Secure cookies whenever the app is served over HTTPS (always in staging/production). */
function secureCookies(): boolean {
  return env().APP_URL.startsWith("https://");
}

/** "__Host-" binds the cookie to this exact origin: Secure, Path=/, and no Domain attribute. */
export function sessionCookieName(): string {
  return secureCookies() ? "__Host-session" : "session";
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_POLICY.sessionMaxAgeSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(sessionCookieName());
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}

/**
 * Client address for rate limiting. Only the first X-Forwarded-For hop is used; the hosting
 * platform must overwrite this header (documented in 12_AUTHENTICATION.md).
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip") || "unknown").slice(0, 64);
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

/** The current session, validated against the database once per request. */
export const getCurrentSession = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  return validateSession(getDatabase(), token);
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * The signed-in user's access for this request — scope, branches, and permissions — resolved
 * from the server-side session only, never from cookies, URLs, or form fields.
 */
export const getRequestAccess = cache(async (): Promise<AccessContext | null> => {
  const session = await getCurrentSession();
  if (!session) return null;
  try {
    return await resolveAccessContext(getDatabase(), session.userId);
  } catch (error) {
    if (error instanceof AccessDeniedError) return null;
    throw error;
  }
});

/** Session plus access context for a signed-in page; redirects to sign-in otherwise. */
export async function requireAccess(): Promise<{ session: SessionUser; access: AccessContext }> {
  const session = await requireSession();
  const access = await getRequestAccess();
  if (!access) redirect("/login");
  return { session, access };
}

/** The school's public profile (name, timezone), loaded once per request. */
export const getRequestSchool = cache(async (): Promise<SchoolProfile> =>
  getSchoolProfile(getDatabase()),
);

/**
 * The branch filter for this request: the session's stored branch, re-validated against the
 * current scope. Falls back to null ("all branches in scope") if access was removed meanwhile.
 */
export const getRequestBranch = cache(async (): Promise<BranchOption | null> => {
  const session = await getCurrentSession();
  const access = await getRequestAccess();
  if (!session?.activeBranchId || !access) return null;
  return resolveBranchFilter(getDatabase(), access, session.activeBranchId);
});

/** Validate and store a branch filter. Returns false for branches outside the user scope. */
export async function switchBranch(branchId: string | null): Promise<boolean> {
  const session = await getCurrentSession();
  const access = await getRequestAccess();
  if (!session || !access) return false;
  const db = getDatabase();
  if (branchId !== null && !(await resolveBranchFilter(db, access, branchId))) return false;
  await setSessionBranch(db, session.sessionId, branchId);
  return true;
}
