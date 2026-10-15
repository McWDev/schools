import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-school";
import { listSelectableBranches, resolveBranchFilter } from "@/server/access/branch-filter";
import { resolveAccessContext, type AccessContext } from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import { getDatabase } from "@/server/db/client";
import {
  createBranch,
  DuplicateBranchCodeError,
  getBranch,
  listBranchStaff,
  listBranchSummaries,
  setBranchStatus,
  updateBranch,
} from "@/server/modules/branches/service";
import { getDashboardSummary } from "@/server/modules/dashboard/service";

import { closeOwner, ownerQuery, resetSchool } from "./helpers";

const db = getDatabase();
let admin: AccessContext;
let mainBranchAdmin: AccessContext;
let mainTeacher: AccessContext;
let northTeacher: AccessContext;

beforeEach(async () => {
  await resetSchool();
  [admin, mainBranchAdmin, mainTeacher, northTeacher] = await Promise.all(
    [t.users.admin, t.users.mainBranchAdmin, t.users.mainTeacher, t.users.northTeacher].map((id) =>
      resolveAccessContext(db, id),
    ),
  );
});

afterAll(closeOwner);

describe("opening and editing branches", () => {
  it("school admin opens a branch with its area and contacts", async () => {
    const branch = await createBranch(db, admin, {
      name: "East Campus",
      code: "east",
      area: "Hodan District",
      address: "Maka Al Mukarama Road",
      phone: "+252 61 111 1111",
      email: "EAST@school.example",
    });
    expect(branch).toMatchObject({
      code: "EAST",
      area: "Hodan District",
      email: "east@school.example",
      status: "active",
    });
    const summaries = await listBranchSummaries(db, admin);
    expect(summaries.map((b) => b.code)).toEqual(["EAST", "MAIN", "NORTH"]);
  });

  it("empty optional fields are stored as not set", async () => {
    const branch = await createBranch(db, admin, {
      name: "West Campus",
      code: "WEST",
      area: "",
      phone: "",
      email: "",
    });
    expect(branch).toMatchObject({ area: null, phone: null, email: null });
  });

  it("only school-wide administrators can open, edit, or deactivate branches", async () => {
    for (const actor of [mainBranchAdmin, mainTeacher]) {
      await expect(createBranch(db, actor, { name: "Rogue", code: "ROGUE" })).rejects.toThrow(
        ForbiddenError,
      );
      await expect(setBranchStatus(db, actor, t.branches.main, "inactive")).rejects.toThrow(
        ForbiddenError,
      );
      await expect(updateBranch(db, actor, t.branches.main, { name: "Renamed" })).rejects.toThrow(
        ForbiddenError,
      );
    }
    const [row] = await ownerQuery<{ name: string; status: string }>(
      `select name, status from branches where id = $1`,
      [t.branches.main],
    );
    expect(row).toEqual({ name: "Main Campus", status: "active" });
  });

  it("rejects duplicate codes, bad emails, and unexpected fields", async () => {
    await expect(createBranch(db, admin, { name: "Main Two", code: "Main" })).rejects.toThrow(
      DuplicateBranchCodeError,
    );
    await expect(updateBranch(db, admin, t.branches.north, { code: "MAIN" })).rejects.toThrow(
      DuplicateBranchCodeError,
    );
    await expect(
      createBranch(db, admin, { name: "East", code: "EAST", email: "not-an-email" }),
    ).rejects.toThrow(/email/i);
    await expect(
      createBranch(db, admin, { name: "East", code: "EAST", status: "inactive" }),
    ).rejects.toThrow();
  });

  it("records create, update, deactivate, and reactivate in the audit log", async () => {
    const branch = await createBranch(db, admin, { name: "East Campus", code: "EAST" });
    await updateBranch(db, admin, branch.id, { area: "East District" });
    await setBranchStatus(db, admin, branch.id, "inactive");
    await setBranchStatus(db, admin, branch.id, "active");
    const events = await ownerQuery<{ action: string; branch_id: string; metadata: unknown }>(
      `select action, branch_id, metadata from audit_events order by occurred_at`,
    );
    expect(events.map((e) => e.action)).toEqual([
      "branch.create",
      "branch.update",
      "branch.deactivate",
      "branch.reactivate",
    ]);
    expect(events.every((e) => e.branch_id === branch.id)).toBe(true);
    expect(events[1].metadata).toEqual({ fields: ["area"] });
  });
});

describe("visibility", () => {
  it("school admin sees every branch; branch staff see only their own", async () => {
    expect((await listBranchSummaries(db, admin)).map((b) => b.code)).toEqual(["MAIN", "NORTH"]);
    expect((await listBranchSummaries(db, mainTeacher)).map((b) => b.code)).toEqual(["MAIN"]);
    expect((await listBranchSummaries(db, northTeacher)).map((b) => b.code)).toEqual(["NORTH"]);
    expect(await getBranch(db, mainTeacher, t.branches.north)).toBeNull();
  });

  it("counts staff assigned to each branch", async () => {
    const summaries = await listBranchSummaries(db, admin);
    expect(Object.fromEntries(summaries.map((b) => [b.code, b.assignedStaff]))).toEqual({
      MAIN: 2,
      NORTH: 1,
    });
  });

  it("lists a branch's staff only to people who may see staff", async () => {
    expect((await listBranchStaff(db, admin, t.branches.main)).map((s) => s.displayName)).toEqual([
      "Main Branch Admin",
      "Main Teacher",
    ]);
    expect(await listBranchStaff(db, mainTeacher, t.branches.main)).toEqual([]);
    expect(await listBranchStaff(db, mainBranchAdmin, t.branches.north)).toEqual([]);
  });
});

describe("deactivation keeps history", () => {
  it("an inactive branch leaves selectors and counts but keeps staff, history, and records", async () => {
    await ownerQuery(
      `insert into audit_events (branch_id, actor_user_id, action, outcome) values ($1, $2, 'x.history', 'success')`,
      [t.branches.north, t.users.admin],
    );
    await setBranchStatus(db, admin, t.branches.north, "inactive");

    expect((await listSelectableBranches(db, admin)).map((b) => b.code)).toEqual(["MAIN"]);
    expect(await resolveBranchFilter(db, admin, t.branches.north)).toBeNull();
    expect((await getDashboardSummary(db, admin, null)).branches).toEqual({ active: 1 });

    // Still listed (as inactive) with its assignments and history intact.
    const north = (await listBranchSummaries(db, admin)).find((b) => b.code === "NORTH");
    expect(north).toMatchObject({ status: "inactive", assignedStaff: 1 });
    expect(
      await ownerQuery(`select 1 from user_branches where branch_id = $1`, [t.branches.north]),
    ).toHaveLength(1);
    expect(await ownerQuery(`select 1 from audit_events where action = 'x.history'`)).toHaveLength(
      1,
    );

    await setBranchStatus(db, admin, t.branches.north, "active");
    expect((await listSelectableBranches(db, admin)).map((b) => b.code)).toEqual(["MAIN", "NORTH"]);
  });

  it("branches cannot be deleted by the application", async () => {
    await expect(
      db.execute(sql.raw(`delete from branches where id = '${t.branches.north}'`)),
    ).rejects.toThrow();
  });
});
