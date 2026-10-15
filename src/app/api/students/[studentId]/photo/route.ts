import { NextResponse } from "next/server";

import { getRequestAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getVisibleStudentPhotoKey } from "@/server/modules/students/service";
import { getStorage } from "@/server/storage/object-storage";

const notFound = () =>
  NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );

/**
 * A student's photo, served only to staff who can see that student. Students of other branches
 * get 404, the same as a missing photo, so IDs cannot be probed.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/students/[studentId]/photo">,
): Promise<Response> {
  const access = await getRequestAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { studentId } = await params;
  const key = await getVisibleStudentPhotoKey(getDatabase(), access, studentId);
  if (!key) return notFound();
  const body = await getStorage().get(key);
  if (!body) return notFound();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
