import "server-only";

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { requirePermission, withAccess, type AccessContext } from "@/server/access/context";
import type { Database } from "@/server/db/client";
import { schoolSettings } from "@/server/db/schema";
import { recordAudit } from "@/server/modules/audit/record";
import { processLogo } from "@/server/modules/profile/avatar-image";
import type { ObjectStorage } from "@/server/storage/object-storage";

export interface SchoolSettingsView {
  name: string;
  shortName: string | null;
  timezone: string;
  locale: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  hasLogo: boolean;
}

const TIMEZONES = new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);

/** All timezones the server's Intl data knows, for the settings form. */
export function supportedTimezones(): string[] {
  return [...TIMEZONES].sort();
}

/** Empty strings from forms mean "not set". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .optional();

// .strict(): unknown keys (e.g. "id", "logoKey") are rejected instead of silently ignored.
export const settingsInput = z
  .object({
    name: z.string().trim().min(2, "Enter the school name.").max(120),
    shortName: optionalText(20),
    timezone: z
      .string()
      .refine((value) => TIMEZONES.has(value), "Choose a timezone from the list."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .refine(
        (value) => value === "" || z.email().safeParse(value).success,
        "Enter a valid email address.",
      )
      .transform((value) => (value === "" ? null : value))
      .optional(),
    phone: optionalText(40),
    address: optionalText(300),
  })
  .strict();

const columns = {
  name: schoolSettings.name,
  shortName: schoolSettings.shortName,
  timezone: schoolSettings.timezone,
  locale: schoolSettings.locale,
  email: schoolSettings.email,
  phone: schoolSettings.phone,
  address: schoolSettings.address,
  logoKey: schoolSettings.logoKey,
};

function toView(
  row: { logoKey: string | null } & Omit<SchoolSettingsView, "hasLogo">,
): SchoolSettingsView {
  const { logoKey, ...rest } = row;
  return { ...rest, hasLogo: logoKey !== null };
}

export async function getSchoolSettings(
  db: Database,
  context: AccessContext,
): Promise<SchoolSettingsView> {
  requirePermission(context, "school.settings.manage");
  return withAccess(db, context, async (tx) => {
    const [row] = await tx.select(columns).from(schoolSettings).where(eq(schoolSettings.id, 1));
    return toView(row);
  });
}

/** Update the school profile and record which fields changed (values are not logged). */
export async function updateSchoolSettings(
  db: Database,
  context: AccessContext,
  input: unknown,
): Promise<SchoolSettingsView> {
  requirePermission(context, "school.settings.manage");
  const data = settingsInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [before] = await tx.select(columns).from(schoolSettings).where(eq(schoolSettings.id, 1));
    const [after] = await tx
      .update(schoolSettings)
      .set(data)
      .where(eq(schoolSettings.id, 1))
      .returning(columns);
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
      (key) => (before[key] ?? null) !== (after[key] ?? null),
    );
    if (changed.length > 0) {
      await recordAudit(tx, {
        actorUserId: context.userId,
        action: "school.settings.update",
        targetType: "school",
        targetId: "1",
        metadata: { fields: changed.sort() },
      });
    }
    return toView(after);
  });
}

/** Validate, re-encode, and store a new logo under a server-generated key. */
export async function setSchoolLogo(
  db: Database,
  storage: ObjectStorage,
  context: AccessContext,
  upload: Uint8Array,
): Promise<void> {
  requirePermission(context, "school.settings.manage");
  const image = await processLogo(upload);
  const key = `school/logo-${randomBytes(12).toString("hex")}.webp`;
  await storage.put(key, image, "image/webp");
  const previous = await withAccess(db, context, async (tx) => {
    const [row] = await tx
      .select({ key: schoolSettings.logoKey })
      .from(schoolSettings)
      .where(eq(schoolSettings.id, 1));
    await tx.update(schoolSettings).set({ logoKey: key }).where(eq(schoolSettings.id, 1));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "school.settings.update",
      targetType: "school",
      targetId: "1",
      metadata: { fields: ["logo"] },
    });
    return row?.key ?? null;
  });
  if (previous) await storage.delete(previous);
}

export async function removeSchoolLogo(
  db: Database,
  storage: ObjectStorage,
  context: AccessContext,
): Promise<void> {
  requirePermission(context, "school.settings.manage");
  const previous = await withAccess(db, context, async (tx) => {
    const [row] = await tx
      .select({ key: schoolSettings.logoKey })
      .from(schoolSettings)
      .where(eq(schoolSettings.id, 1));
    if (!row?.key) return null;
    await tx.update(schoolSettings).set({ logoKey: null }).where(eq(schoolSettings.id, 1));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "school.settings.update",
      targetType: "school",
      targetId: "1",
      metadata: { fields: ["logo"] },
    });
    return row.key;
  });
  if (previous) await storage.delete(previous);
}

/** Storage key of the public school logo, if any. Readable without a session (sign-in page). */
export async function getPublicLogoKey(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ key: schoolSettings.logoKey })
    .from(schoolSettings)
    .where(eq(schoolSettings.id, 1));
  return row?.key ?? null;
}
