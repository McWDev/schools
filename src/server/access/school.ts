import "server-only";

import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { schoolSettings } from "@/server/db/schema";

export interface SchoolProfile {
  name: string;
  shortName: string | null;
  timezone: string;
  locale: string;
  hasLogo: boolean;
  /** Versioned URL of the logo (changes when the profile changes), or null. */
  logoUrl: string | null;
}

/** The school's public profile. Always present: created by migrations, edited in Settings. */
export async function getSchoolProfile(db: Database): Promise<SchoolProfile> {
  const [row] = await db
    .select({
      name: schoolSettings.name,
      shortName: schoolSettings.shortName,
      timezone: schoolSettings.timezone,
      locale: schoolSettings.locale,
      logoKey: schoolSettings.logoKey,
      updatedAt: schoolSettings.updatedAt,
    })
    .from(schoolSettings)
    .where(eq(schoolSettings.id, 1))
    .limit(1);
  if (!row) {
    return {
      name: "School",
      shortName: null,
      timezone: "UTC",
      locale: "en",
      hasLogo: false,
      logoUrl: null,
    };
  }
  const { logoKey, updatedAt, ...profile } = row;
  return {
    ...profile,
    hasLogo: logoKey !== null,
    logoUrl: logoKey ? `/api/school/logo?v=${updatedAt.getTime()}` : null,
  };
}
