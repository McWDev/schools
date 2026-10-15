import { connection } from "next/server";

import { getDatabase } from "@/server/db/client";
import { getPublicLogoKey } from "@/server/modules/settings/service";
import { getStorage } from "@/server/storage/object-storage";

/**
 * The school logo. Public on purpose: it is shown on the sign-in page before anyone signs in,
 * and contains no personal data. Always a re-encoded WebP.
 */
export async function GET(): Promise<Response> {
  // Read at request time; never prerender this route at build (the logo can change at any time).
  await connection();
  const key = await getPublicLogoKey(getDatabase());
  const body = key ? await getStorage().get(key) : null;
  if (!body)
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "public, max-age=300",
    },
  });
}
