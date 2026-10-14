import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { env } from "@/lib/env";
import { getDatabase } from "@/server/db/client";
import { resolveTenantContext, type TenantContext } from "@/server/tenancy/context";
import { TenantAccessError } from "@/server/tenancy/errors";
import { listUserSchools, type UserSchool } from "@/server/tenancy/memberships";

import { AUTH_POLICY } from "./config";
import {
  rememberSessionSchool,
  switchSessionSchool,
  validateSession,
  type SessionUser,
} from "./sessions";

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

/** Schools the signed-in user may switch into, loaded once per request. */
export const getCurrentUserSchools = cache(async (): Promise<UserSchool[]> => {
  const session = await getCurrentSession();
  return session ? listUserSchools(getDatabase(), session.userId) : [];
});

/**
 * Tenant context for this request, derived only from the server-side session and the user's
 * active membership — never from cookies, URLs, or form fields. Returns null when no school is
 * selected or the membership is no longer active.
 */
export const getRequestTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await getCurrentSession();
  if (!session) return null;
  const db = getDatabase();

  let schoolId = session.activeSchoolId;
  let autoSelected = false;
  if (!schoolId) {
    // Convenience: a user with exactly one school does not need to pick it.
    const schools = await getCurrentUserSchools();
    if (schools.length !== 1) return null;
    schoolId = schools[0].schoolId;
    autoSelected = true;
  }
  try {
    const context = await resolveTenantContext(db, { userId: session.userId, schoolId });
    if (autoSelected) await rememberSessionSchool(db, session.sessionId, schoolId);
    return context;
  } catch (error) {
    if (error instanceof TenantAccessError) return null;
    throw error;
  }
});

/** Validate membership, store the selection server-side, and rotate the session token. */
export async function switchSchool(schoolId: string): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session) return false;
  const db = getDatabase();
  try {
    await resolveTenantContext(db, { userId: session.userId, schoolId });
  } catch (error) {
    if (error instanceof TenantAccessError) return false;
    throw error;
  }
  await setSessionCookie(await switchSessionSchool(db, session.sessionId, schoolId));
  return true;
}

/**
 * Session plus tenant context for a signed-in page. Redirects to sign-in without a session, and
 * to the dashboard (school picker) when no school is selected.
 */
export async function requireTenantRequest(): Promise<{
  session: SessionUser;
  context: TenantContext;
}> {
  const session = await requireSession();
  const context = await getRequestTenantContext();
  if (!context) redirect("/dashboard");
  return { session, context };
}
