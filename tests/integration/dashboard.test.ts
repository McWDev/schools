import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-school";
import { listSelectableBranches, resolveBranchFilter } from "@/server/access/branch-filter";
import { resolveAccessContext, type AccessContext } from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import { getDatabase } from "@/server/db/client";
import { getDashboardSummary } from "@/server/modules/dashboard/service";

import { closeOwner, ownerQuery, resetSchool } from "./helpers";

const db = getDatabase();
let admin: AccessContext;
let mainTeacher: AccessContext;
let mainBranchAdmin: AccessContext;

beforeEach(async () => {
  await resetSchool();
  [admin, mainTeacher, mainBranchAdmin] = await Promise.all(
    [t.users.admin, t.users.mainTeacher, t.users.mainBranchAdmin].map((id) =>
      resolveAccessContext(db, id),
    ),
  );
});

afterAll(closeOwner);

describe("branch selection", () => {
  it("lists every branch for school admins and only assigned branches for branch staff", async () => {
    expect((await listSelectableBranches(db, admin)).map((b) => [b.code, b.area])).toEqual([
      ["MAIN", "Central"],
      ["NORTH", "North"],
    ]);
    expect((await listSelectableBranches(db, mainTeacher)).map((b) => b.code)).toEqual(["MAIN"]);
  });

  it("refuses unassigned branches, inactive branches, and malformed IDs", async () => {
    expect(await resolveBranchFilter(db, admin, t.branches.north)).toMatchObject({ code: "NORTH" });
    expect(await resolveBranchFilter(db, mainTeacher, t.branches.north)).toBeNull();
    expect(await resolveBranchFilter(db, admin, "not-a-uuid' or 1=1 --")).toBeNull();
    await ownerQuery(`update branches set status = 'inactive' where id = $1`, [t.branches.north]);
    expect(await resolveBranchFilter(db, admin, t.branches.north)).toBeNull();
  });
});

describe("dashboard summary", () => {
  it("school admin sees branch, staff, and activity figures", async () => {
    const summary = await getDashboardSummary(db, admin, null);
    expect(summary.myRoles).toEqual(["School administrator"]);
    expect(summary.branches).toEqual({ active: 2 });
    expect(summary.staff).toEqual({ active: 4, pendingInvitations: 0, noAccess: 0 });
    expect(summary.recentActivity).toEqual([]);
  });

  it("narrows figures to a selected branch", async () => {
    const summary = await getDashboardSummary(db, admin, t.branches.north);
    expect(summary.branch).toMatchObject({ code: "NORTH" });
    expect(summary.branches).toEqual({ active: 1 });
    // School-wide admin plus the North teacher cover North Campus.
    expect(summary.staff?.active).toBe(2);
  });

  it("counts invited and deactivated staff separately", async () => {
    await ownerQuery(`update users set status = 'invited' where id = $1`, [t.users.northTeacher]);
    await ownerQuery(`update users set status = 'deactivated' where id = $1`, [
      t.users.mainTeacher,
    ]);
    expect((await getDashboardSummary(db, admin, null)).staff).toEqual({
      active: 2,
      pendingInvitations: 1,
      noAccess: 1,
    });
  });

  it("a teacher gets only their own access, no staff or activity data", async () => {
    const summary = await getDashboardSummary(db, mainTeacher, null);
    expect(summary.myRoles).toEqual(["Teacher"]);
    expect(summary.branches).toEqual({ active: 1 });
    expect(summary.staff).toBeUndefined();
    expect(summary.recentActivity).toBeUndefined();
  });

  it("branch admin staff figures cover only people inside their branches", async () => {
    const summary = await getDashboardSummary(db, mainBranchAdmin, null);
    expect(summary.staff?.active).toBe(2);
    expect(summary.recentActivity).toBeUndefined();
  });

  it("refuses dashboard data for a branch outside the user's scope", async () => {
    await expect(getDashboardSummary(db, mainTeacher, t.branches.north)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("recent activity shows administrative events, not sign-ins", async () => {
    await ownerQuery(
      `insert into audit_events (actor_user_id, action, outcome) values
       ($1, 'user.invite', 'success'), ($1, 'auth.login', 'success'), ($1, 'profile.update', 'success')`,
      [t.users.admin],
    );
    const summary = await getDashboardSummary(db, admin, null);
    expect(summary.recentActivity?.map((e) => [e.actorName, e.action])).toEqual([
      ["School Admin", "user.invite"],
    ]);
  });
});
