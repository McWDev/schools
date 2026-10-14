import { NextResponse } from "next/server";

import { getCurrentSession, getRequestAccess } from "@/server/auth/request";

/** Current user and their access scope. Returns 401 without a valid session. */
export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const access = await getRequestAccess();
  return NextResponse.json(
    {
      user: { id: session.userId, displayName: session.displayName, email: session.email },
      access: access
        ? {
            scope: access.scope.kind,
            branchIds: access.scope.kind === "branch" ? access.scope.branchIds : null,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
