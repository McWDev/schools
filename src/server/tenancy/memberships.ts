import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { schoolMemberships, schools } from "@/server/db/schema";

export interface UserSchool {
  schoolId: string;
  name: string;
  scope: "school" | "branch";
}

/** Active schools the user may switch into. Only the user's own memberships are visible. */
export async function listUserSchools(db: Database, userId: string): Promise<UserSchool[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return tx
      .select({ schoolId: schools.id, name: schools.name, scope: schoolMemberships.scope })
      .from(schoolMemberships)
      .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
      .where(
        and(
          eq(schoolMemberships.userId, userId),
          eq(schoolMemberships.status, "active"),
          eq(schools.status, "active"),
        ),
      )
      .orderBy(asc(schools.name))
      .limit(100);
  });
}
