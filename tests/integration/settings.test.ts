import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-school";
import { resolveAccessContext, type AccessContext } from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import { getSchoolProfile } from "@/server/access/school";
import { getDatabase } from "@/server/db/client";
import { AvatarValidationError } from "@/server/modules/profile/avatar-image";
import {
  getPublicLogoKey,
  getSchoolSettings,
  removeSchoolLogo,
  setSchoolLogo,
  updateSchoolSettings,
} from "@/server/modules/settings/service";
import { MemoryStorage } from "@/server/storage/object-storage";

import { closeOwner, ownerQuery, resetSchool } from "./helpers";

const db = getDatabase();
let admin: AccessContext;
let mainBranchAdmin: AccessContext;
let mainTeacher: AccessContext;

const validProfile = {
  name: "Falkaab Model School",
  shortName: "FMS",
  timezone: "Africa/Mogadishu",
  email: "office@falkaab.example",
  phone: "+252 61 000 0000",
  address: "Main Road, Mogadishu",
};

beforeEach(async () => {
  await resetSchool();
  [admin, mainBranchAdmin, mainTeacher] = await Promise.all(
    [t.users.admin, t.users.mainBranchAdmin, t.users.mainTeacher].map((id) =>
      resolveAccessContext(db, id),
    ),
  );
});

afterAll(closeOwner);

describe("school profile", () => {
  it("school admin updates the profile, and the change is audited by field", async () => {
    const saved = await updateSchoolSettings(db, admin, validProfile);
    expect(saved).toMatchObject({ ...validProfile, hasLogo: false });
    expect(await getSchoolProfile(db)).toMatchObject({
      name: "Falkaab Model School",
      timezone: "Africa/Mogadishu",
    });
    const [event] = await ownerQuery<{ action: string; actor_user_id: string; metadata: unknown }>(
      `select action, actor_user_id, metadata from audit_events where action = 'school.settings.update'`,
    );
    expect(event).toMatchObject({
      actor_user_id: t.users.admin,
      metadata: { fields: ["address", "email", "name", "phone", "shortName", "timezone"] },
    });
    // Values themselves are never written to the audit log.
    expect(JSON.stringify(event)).not.toContain("office@falkaab.example");
  });

  it("saving without changes records no audit event", async () => {
    const unchanged = { name: "Example Academy", timezone: "UTC" };
    await updateSchoolSettings(db, admin, unchanged);
    expect(await ownerQuery(`select 1 from audit_events`)).toHaveLength(0);
    await updateSchoolSettings(db, admin, { ...unchanged, name: "Example Academy Two" });
    await updateSchoolSettings(db, admin, { ...unchanged, name: "Example Academy Two" });
    expect(await ownerQuery(`select 1 from audit_events`)).toHaveLength(1);
  });

  it("empty optional fields are stored as not set", async () => {
    const saved = await updateSchoolSettings(db, admin, {
      ...validProfile,
      shortName: "",
      email: "",
      phone: "",
      address: "",
    });
    expect(saved).toMatchObject({ shortName: null, email: null, phone: null, address: null });
  });

  it("branch admins and teachers cannot read or change settings", async () => {
    for (const actor of [mainBranchAdmin, mainTeacher]) {
      await expect(getSchoolSettings(db, actor)).rejects.toThrow(ForbiddenError);
      await expect(updateSchoolSettings(db, actor, validProfile)).rejects.toThrow(ForbiddenError);
    }
    expect((await getSchoolProfile(db)).name).toBe("Example Academy");
  });

  it("rejects unknown timezones, bad emails, and unexpected fields", async () => {
    await expect(
      updateSchoolSettings(db, admin, { ...validProfile, timezone: "Mars/Olympus" }),
    ).rejects.toThrow(/timezone/i);
    await expect(
      updateSchoolSettings(db, admin, { ...validProfile, email: "not-an-email" }),
    ).rejects.toThrow(/email/i);
    for (const forged of [{ id: 2 }, { logoKey: "../../etc/passwd" }, { locale: "xx" }]) {
      await expect(
        updateSchoolSettings(db, admin, { ...validProfile, ...forged }),
      ).rejects.toThrow();
    }
    expect((await getSchoolProfile(db)).name).toBe("Example Academy");
  });
});

describe("school logo", () => {
  const png = () =>
    sharp({ create: { width: 600, height: 200, channels: 4, background: "#2f5bd3" } })
      .png()
      .toBuffer();

  it("stores a re-encoded logo, replaces the old one, and can remove it", async () => {
    const storage = new MemoryStorage();
    await setSchoolLogo(db, storage, admin, await png());
    const first = await getPublicLogoKey(db);
    expect(first).toMatch(/^school\/logo-[0-9a-f]{24}\.webp$/);
    expect((await sharp((await storage.get(first!))!).metadata()).format).toBe("webp");
    expect((await getSchoolProfile(db)).logoUrl).toMatch(/^\/api\/school\/logo\?v=\d+$/);

    await setSchoolLogo(db, storage, admin, await png());
    const second = await getPublicLogoKey(db);
    expect(second).not.toBe(first);
    expect(await storage.get(first!)).toBeNull();

    await removeSchoolLogo(db, storage, admin);
    expect(await getPublicLogoKey(db)).toBeNull();
    expect(await storage.get(second!)).toBeNull();
  });

  it("rejects disguised files and non-administrators", async () => {
    const storage = new MemoryStorage();
    await expect(
      setSchoolLogo(db, storage, admin, Buffer.from("<svg onload='alert(1)'></svg>")),
    ).rejects.toThrow(AvatarValidationError);
    await expect(setSchoolLogo(db, storage, mainBranchAdmin, await png())).rejects.toThrow(
      ForbiddenError,
    );
    expect(await getPublicLogoKey(db)).toBeNull();
  });
});
