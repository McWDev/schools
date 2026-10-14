import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentSession, getRequestAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { getVisibleAvatarKey } from "@/server/modules/users/service";
import { getStorage } from "@/server/storage/object-storage";

const notFound = () =>
  NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );

/**
 * Serves a profile photo only to its owner or to colleagues allowed to see that person.
 * Unauthorized requests get 404, the same as a missing photo, so IDs cannot be probed.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/avatars/[userId]">,
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId } = await params;
  const db = getDatabase();

  let key: string | null = null;
  if (userId === session.userId) {
    const [row] = await db
      .select({ key: users.avatarKey })
      .from(users)
      .where(eq(users.id, session.userId));
    key = row?.key ?? null;
  } else {
    const access = await getRequestAccess();
    key = access ? await getVisibleAvatarKey(db, access, userId) : null;
  }
  if (!key) return notFound();

  const body = await getStorage().get(key);
  if (!body) return notFound();
  return new Response(new Uint8Array(body), {
    headers: {
      // Always re-encoded WebP; nosniff and a locked-down CSP stop any content sniffing tricks.
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
