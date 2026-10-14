import { NextResponse } from "next/server";

import { getCurrentSession, getRequestTenantContext } from "@/server/auth/request";

/** Current user and school context. Returns 401 without a valid session. */
export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const context = await getRequestTenantContext();
  return NextResponse.json(
    {
      user: { id: session.userId, displayName: session.displayName, email: session.email },
      school: context ? { id: context.schoolId, scope: context.scope.kind } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
