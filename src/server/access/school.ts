import "server-only";

import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { schoolSettings } from "@/server/db/schema";

export interface SchoolProfile {
  name: string;
  shortName: string | null;
  timezone: string;
  locale: string;
}

/** The school's public profile. Always present: created by migrations, edited in Settings. */
export async function getSchoolProfile(db: Database): Promise<SchoolProfile> {
  const [row] = await db
    .select({
      name: schoolSettings.name,
      shortName: schoolSettings.shortName,
      timezone: schoolSettings.timezone,
      locale: schoolSettings.locale,
    })
    .from(schoolSettings)
    .where(eq(schoolSettings.id, 1))
    .limit(1);
  return row ?? { name: "School", shortName: null, timezone: "UTC", locale: "en" };
}
