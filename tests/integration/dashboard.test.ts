import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-tenants";
import { getDatabase } from "@/server/db/client";
import { getDashboardSummary, getPlatformOverview } from "@/server/modules/dashboard/service";
import { listSelectableBranches, resolveBranchFilter } from "@/server/tenancy/branch-filter";
import { resolveTenantContext, type TenantContext } from "@/server/tenancy/context";
import { ForbiddenError } from "@/server/tenancy/errors";

import { closeOwner, ownerQuery, resetTenants } from "./helpers";

const db = getDatabase();
let adminA: TenantContext;
let teacherA1: TenantContext;
let branchAdminA1: TenantContext;
let adminB: TenantContext;

beforeEach(async () => {
  await resetTenants();
  [adminA, teacherA1, branchAdminA1, adminB] = await Promise.all([
    resolveTenantContext(db, { userId: t.users.adminA, schoolId: t.schoolA.id }),
    resolveTenantContext(db, { userId: t.users.teacherA1, schoolId: t.schoolA.id }),
    resolveTenantContext(db, { userId: t.users.branchAdminA1, schoolId: t.schoolA.id }),
    resolveTenantContext(db, { userId: t.users.adminB, schoolId: t.schoolB.id }),
  ]);
});

afterAll(closeOwner);

describe("branch selection", () => {
  it("lists every branch for school admins and only assigned branches for branch users", async () => {
    expect((await listSelectableBranches(db, adminA)).map((b) => b.code)).toEqual([
      "A-MAIN",
      "A-NORTH",
    ]);
    expect((await listSelectableBranches(db, teacherA1)).map((b) => b.code)).toEqual(["A-MAIN"]);
    expect((await listSelectableBranches(db, adminB)).map((b) => b.code)).toEqual(["B-MAIN"]);
  });

  it("refuses unassigned branches, other schools' branches, and malformed IDs", async () => {
    expect(await resolveBranchFilter(db, adminA, t.schoolA.branchA2)).toMatchObject({
      code: "A-NORTH",
    });
    expect(await resolveBranchFilter(db, teacherA1, t.schoolA.branchA2)).toBeNull();
    expect(await resolveBranchFilter(db, adminA, t.schoolB.branchB1)).toBeNull();
    expect(await resolveBranchFilter(db, adminA, "not-a-uuid' or 1=1 --")).toBeNull();
  });

  it("the database rejects a session branch that belongs to a different school", async () => {
    const [session] = await ownerQuery<{ id: string }>(
      `insert into sessions (token_hash, user_id, active_school_id, expires_at)
       values (repeat('a', 64), $1, $2, now() + interval '1 day') returning id`,
      [t.users.adminA, t.schoolA.id],
    );
    await expect(
      ownerQuery(`update sessions set active_branch_id = $1 where id = $2`, [
        t.schoolB.branchB1,
        session.id,
      ]),
    ).rejects.toThrow(/sessions_active_branch_fk/);
    await expect(
      ownerQuery(
        `update sessions set active_school_id = null, active_branch_id = $1 where id = $2`,
        [t.schoolA.branchA1, session.id],
      ),
    ).rejects.toThrow(/sessions_branch_requires_school/);
  });
});

describe("dashboard summary", () => {
  it("school admin sees branch, staff, and activity figures for their school only", async () => {
    const summary = await getDashboardSummary(db, adminA, null);
    expect(summary.myRoles).toEqual(["School administrator"]);
    expect(summary.branches).toEqual({ active: 2 });
    expect(summary.staff).toEqual({ active: 4, pendingInvitations: 0, noAccess: 0 });
    expect(summary.recentActivity).toEqual([]);
  });

  it("narrows figures to a selected branch", async () => {
    const summary = await getDashboardSummary(db, adminA, t.schoolA.branchA2);
    expect(summary.branch).toMatchObject({ code: "A-NORTH" });
    expect(summary.branches).toEqual({ active: 1 });
    // Only school-wide staff (admin A and the multi-school user) cover A-NORTH.
    expect(summary.staff?.active).toBe(2);
  });

  it("a teacher gets only their own access, no staff or activity data", async () => {
    const summary = await getDashboardSummary(db, teacherA1, null);
    expect(summary.myRoles).toEqual(["Teacher"]);
    expect(summary.branches).toEqual({ active: 1 });
    expect(summary.staff).toBeUndefined();
    expect(summary.recentActivity).toBeUndefined();
  });

  it("branch admin staff figures cover only members inside their branches", async () => {
    const summary = await getDashboardSummary(db, branchAdminA1, null);
    expect(summary.staff?.active).toBe(2);
    expect(summary.recentActivity).toBeUndefined();
  });

  it("refuses dashboard data for a branch outside the user's scope or school", async () => {
    await expect(getDashboardSummary(db, teacherA1, t.schoolA.branchA2)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(getDashboardSummary(db, adminA, t.schoolB.branchB1)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("recent activity shows this school's events only", async () => {
    await ownerQuery(
      `insert into audit_events (school_id, actor_user_id, action, outcome) values
       ($1, $2, 'user.invite', 'success'), ($3, $4, 'user.invite', 'success'), (null, $2, 'auth.login', 'success')`,
      [t.schoolA.id, t.users.adminA, t.schoolB.id, t.users.adminB],
    );
    const summary = await getDashboardSummary(db, adminA, null);
    expect(summary.recentActivity?.map((e) => [e.actorName, e.action])).toEqual([
      ["Admin A", "user.invite"],
    ]);
  });
});

describe("platform overview", () => {
  it("platform admins get aggregate counts; everyone else gets nothing", async () => {
    await ownerQuery(`update schools set status = 'suspended' where id = $1`, [t.schoolB.id]);
    expect(
      await getPlatformOverview(db, { userId: t.users.platformAdmin, isPlatformAdmin: true }),
    ).toEqual({
      total: 2,
      byStatus: { active: 1, suspended: 1 },
    });
    expect(
      await getPlatformOverview(db, { userId: t.users.adminA, isPlatformAdmin: false }),
    ).toBeNull();
  });

  it("the database function ignores a forged platform flag for a non-admin user", async () => {
    // Even if application code were tricked into calling it, the function checks the user row.
    expect(
      await getPlatformOverview(db, { userId: t.users.adminA, isPlatformAdmin: true }),
    ).toEqual({
      total: 0,
      byStatus: {},
    });
    const direct = await db.execute(sql`select * from app.platform_school_counts()`);
    expect(direct.rows).toEqual([]);
  });
});
