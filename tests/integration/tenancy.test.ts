import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { SyntheticTenants } from "../../scripts/lib/synthetic-tenants";
import { createDatabase, getDatabase, type DatabaseHandle } from "@/server/db/client";
import { auditEvents, branches, membershipBranches } from "@/server/db/schema";
import {
  createBranch,
  getBranch,
  listBranches,
  updateBranch,
} from "@/server/modules/branches/service";
import { resolveTenantContext, withTenant, type TenantContext } from "@/server/tenancy/context";
import { ForbiddenError, TenantAccessError } from "@/server/tenancy/errors";

import { closeOwner, ownerQuery, resetTenants, runtimeUrl } from "./helpers";

const db = getDatabase();
const extraPools: DatabaseHandle[] = [];

let t: SyntheticTenants;
let adminA: TenantContext;
let teacherA1: TenantContext;
let adminB: TenantContext;

// Seeded IDs are fixed, so contexts resolved once stay valid after each re-seed. Tests that change
// memberships resolve a fresh context themselves.
beforeAll(async () => {
  t = await resetTenants();
  adminA = await resolveTenantContext(db, { userId: t.users.adminA, schoolId: t.schoolA.id });
  teacherA1 = await resolveTenantContext(db, { userId: t.users.teacherA1, schoolId: t.schoolA.id });
  adminB = await resolveTenantContext(db, { userId: t.users.adminB, schoolId: t.schoolB.id });
});

beforeEach(async () => {
  await resetTenants();
});

afterAll(async () => {
  await Promise.all(extraPools.map((handle) => handle.pool.end()));
  await closeOwner();
});

/** Raw runtime-role query with no tenant context at all. */
async function countWithoutContext(table: string): Promise<number> {
  const result = await db.execute<{ n: number }>(
    sql.raw(`select count(*)::int as n from ${table}`),
  );
  return result.rows[0].n;
}

/** Postgres error details are wrapped by drizzle; collect the whole cause chain as text. */
function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message, String((current as { code?: string }).code ?? ""));
    current = current.cause;
  }
  return parts.join(" | ");
}

async function expectDbError(work: Promise<unknown>, pattern: RegExp): Promise<void> {
  const error = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, "expected the database to reject this operation").toBeDefined();
  expect(errorText(error)).toMatch(pattern);
}

describe("runtime database role", () => {
  it("is not a superuser, cannot bypass RLS, and owns no tables", async () => {
    const result = await db.execute<{
      role: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      owned: number;
    }>(sql`
      select current_user as role, r.rolsuper, r.rolbypassrls,
        (select count(*)::int from pg_tables where schemaname = 'public' and tableowner = current_user) as owned
      from pg_roles r where r.rolname = current_user
    `);
    expect(result.rows[0]).toEqual({
      role: "app_runtime",
      rolsuper: false,
      rolbypassrls: false,
      owned: 0,
    });
  });
});

describe("missing tenant context fails closed", () => {
  it("returns no tenant rows to the runtime role without context", async () => {
    for (const table of [
      "schools",
      "branches",
      "school_memberships",
      "membership_branches",
      "audit_events",
    ]) {
      expect(await countWithoutContext(table), table).toBe(0);
    }
  });

  it("rejects undefined and forged context objects", async () => {
    await expect(
      withTenant(db, undefined as unknown as TenantContext, async () => 1),
    ).rejects.toThrow(TenantAccessError);
    const forged = {
      schoolId: t.schoolB.id,
      userId: t.users.adminA,
      membershipId: t.memberships.adminA,
      scope: { kind: "school" },
    } as TenantContext;
    await expect(listBranches(db, forged)).rejects.toThrow(TenantAccessError);
  });

  it("cannot mutate an issued context to switch schools", () => {
    expect(() => {
      (adminA as { schoolId: string }).schoolId = t.schoolB.id;
    }).toThrow(TypeError);
  });
});

describe("tenant context resolution", () => {
  it("denies access to a school the user is not a member of", async () => {
    await expect(
      resolveTenantContext(db, { userId: t.users.adminA, schoolId: t.schoolB.id }),
    ).rejects.toThrow(TenantAccessError);
  });

  it("denies suspended memberships, suspended schools, and deactivated users", async () => {
    await ownerQuery(`update school_memberships set status = 'suspended' where id = $1`, [
      t.memberships.adminA,
    ]);
    await expect(
      resolveTenantContext(db, { userId: t.users.adminA, schoolId: t.schoolA.id }),
    ).rejects.toThrow(TenantAccessError);

    await ownerQuery(`update schools set status = 'suspended' where id = $1`, [t.schoolB.id]);
    await expect(
      resolveTenantContext(db, { userId: t.users.adminB, schoolId: t.schoolB.id }),
    ).rejects.toThrow(TenantAccessError);

    await ownerQuery(`update users set status = 'deactivated' where id = $1`, [t.users.teacherA1]);
    await expect(
      resolveTenantContext(db, { userId: t.users.teacherA1, schoolId: t.schoolA.id }),
    ).rejects.toThrow(TenantAccessError);
  });

  it("rejects malformed IDs before touching the database", async () => {
    await expect(
      resolveTenantContext(db, { userId: "1 or 1=1", schoolId: t.schoolA.id }),
    ).rejects.toThrow(TenantAccessError);
  });

  it("gives a multi-school user an explicit, separate context per school", async () => {
    const inA = await resolveTenantContext(db, {
      userId: t.users.multiSchool,
      schoolId: t.schoolA.id,
    });
    const inB = await resolveTenantContext(db, {
      userId: t.users.multiSchool,
      schoolId: t.schoolB.id,
    });
    expect((await listBranches(db, inA)).map((b) => b.code).sort()).toEqual(["A-MAIN", "A-NORTH"]);
    expect((await listBranches(db, inB)).map((b) => b.code)).toEqual(["B-MAIN"]);
  });

  it("removing a branch assignment removes access on the next resolution", async () => {
    await ownerQuery(`delete from membership_branches where membership_id = $1`, [
      t.memberships.teacherA1,
    ]);
    const fresh = await resolveTenantContext(db, {
      userId: t.users.teacherA1,
      schoolId: t.schoolA.id,
    });
    expect(await listBranches(db, fresh)).toEqual([]);
    expect(await getBranch(db, fresh, t.schoolA.branchA1)).toBeNull();
  });
});

describe("cross-school isolation", () => {
  it("school-wide admin sees all of their own branches and none of another school's", async () => {
    expect((await listBranches(db, adminA)).map((b) => b.code).sort()).toEqual([
      "A-MAIN",
      "A-NORTH",
    ]);
    expect((await listBranches(db, adminB)).map((b) => b.code)).toEqual(["B-MAIN"]);
  });

  it("guessing another school's branch ID returns not found", async () => {
    expect(await getBranch(db, adminA, t.schoolB.branchB1)).toBeNull();
  });

  it("cannot update another school's branch by ID", async () => {
    expect(await updateBranch(db, adminA, t.schoolB.branchB1, { name: "Hijacked" })).toBeNull();
    const [row] = await ownerQuery<{ name: string }>(`select name from branches where id = $1`, [
      t.schoolB.branchB1,
    ]);
    expect(row.name).toBe("B Main Campus");
  });

  it("rejects a forged school_id in the request payload", async () => {
    for (const forged of [{ schoolId: t.schoolB.id }, { school_id: t.schoolB.id }]) {
      await expect(
        createBranch(db, adminA, { name: "Forged", code: "FORGED", ...forged }),
      ).rejects.toThrow();
    }
    const rows = await ownerQuery(`select 1 from branches where code = 'FORGED'`);
    expect(rows).toHaveLength(0);
  });

  it("row-level security blocks writing rows into another school even with raw queries", async () => {
    await expectDbError(
      withTenant(db, adminA, (tx) =>
        tx.insert(branches).values({ schoolId: t.schoolB.id, name: "Smuggled", code: "SMUGGLED" }),
      ),
      /row-level security/i,
    );
    const updated = await withTenant(db, adminA, (tx) =>
      tx
        .update(branches)
        .set({ name: "Hijacked" })
        .where(sql`${branches.id} = ${t.schoolB.branchB1}`)
        .returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("row-level security hides another school's rows even if the query forgets to filter", async () => {
    const rows = await withTenant(db, adminA, (tx) =>
      tx.select({ schoolId: branches.schoolId }).from(branches),
    );
    expect(new Set(rows.map((row) => row.schoolId))).toEqual(new Set([t.schoolA.id]));
  });
});

describe("branch links cannot cross schools", () => {
  it("database constraint rejects assigning a School A membership to a School B branch (owner role)", async () => {
    await expectDbError(
      ownerQuery(
        `insert into membership_branches (school_id, membership_id, branch_id) values ($1, $2, $3)`,
        [t.schoolA.id, t.memberships.teacherA1, t.schoolB.branchB1],
      ),
      /membership_branches_branch_fk|23503/,
    );
  });

  it("rejects the same link labelled with School B's ID", async () => {
    await expectDbError(
      ownerQuery(
        `insert into membership_branches (school_id, membership_id, branch_id) values ($1, $2, $3)`,
        [t.schoolB.id, t.memberships.teacherA1, t.schoolB.branchB1],
      ),
      /membership_branches_membership_fk|23503/,
    );
  });

  it("runtime role cannot create the cross-school link either", async () => {
    await expectDbError(
      withTenant(db, adminA, (tx) =>
        tx.insert(membershipBranches).values({
          schoolId: t.schoolA.id,
          membershipId: t.memberships.teacherA1,
          branchId: t.schoolB.branchB1,
        }),
      ),
      /23503|foreign key/i,
    );
  });

  it("audit events cannot reference a branch of a different school", async () => {
    await expectDbError(
      ownerQuery(
        `insert into audit_events (school_id, branch_id, action, outcome) values ($1, $2, 'x', 'success')`,
        [t.schoolA.id, t.schoolB.branchB1],
      ),
      /audit_events_branch_fk|23503/,
    );
  });
});

describe("cross-branch isolation", () => {
  it("branch user sees only their assigned branch", async () => {
    expect((await listBranches(db, teacherA1)).map((b) => b.code)).toEqual(["A-MAIN"]);
  });

  it("branch user cannot read or update a sibling branch by ID", async () => {
    expect(await getBranch(db, teacherA1, t.schoolA.branchA2)).toBeNull();
    expect(await updateBranch(db, teacherA1, t.schoolA.branchA2, { name: "Hijacked" })).toBeNull();
  });

  it("branch user cannot create branches", async () => {
    await expect(createBranch(db, teacherA1, { name: "Rogue", code: "ROGUE" })).rejects.toThrow(
      ForbiddenError,
    );
    await expectDbError(
      withTenant(db, teacherA1, (tx) =>
        tx.insert(branches).values({ schoolId: t.schoolA.id, name: "Rogue", code: "ROGUE" }),
      ),
      /row-level security/i,
    );
  });
});

describe("pooled connections do not leak tenant context", () => {
  it("context is cleared after commit and after rollback on the same connection", async () => {
    const single = createDatabase(runtimeUrl(), { max: 1 });
    extraPools.push(single);

    await withTenant(single.db, adminA, (tx) => tx.select().from(branches));
    const afterCommit = await single.db.execute<{ school: string | null; n: number }>(
      sql`select current_setting('app.school_id', true) as school, (select count(*)::int from branches) as n`,
    );
    expect(afterCommit.rows[0].n).toBe(0);
    expect(afterCommit.rows[0].school ?? "").toBe("");

    await expect(
      withTenant(single.db, adminA, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const afterRollback = await single.db.execute<{ n: number }>(
      sql`select count(*)::int as n from branches`,
    );
    expect(afterRollback.rows[0].n).toBe(0);
  });

  it("concurrent requests for different schools only ever see their own rows", async () => {
    const small = createDatabase(runtimeUrl(), { max: 3 });
    extraPools.push(small);
    const contexts = [adminA, adminB, teacherA1];
    const expected = new Map([
      [adminA, new Set([t.schoolA.branchA1, t.schoolA.branchA2])],
      [adminB, new Set([t.schoolB.branchB1])],
      [teacherA1, new Set([t.schoolA.branchA1])],
    ]);

    const runs = Array.from({ length: 30 }, (_, i) => {
      const context = contexts[i % contexts.length];
      return withTenant(small.db, context, async (tx) => {
        // Hold the transaction briefly so requests interleave on the shared connections.
        await tx.execute(sql`select pg_sleep(0.02)`);
        const rows = await tx.select({ id: branches.id }).from(branches);
        return { context, ids: new Set(rows.map((row) => row.id)) };
      });
    });

    for (const { context, ids } of await Promise.all(runs)) {
      expect(ids).toEqual(expected.get(context));
    }
  });
});

describe("audit trail", () => {
  it("records branch creation in the same transaction, scoped to the school", async () => {
    const created = await createBranch(db, adminA, { name: "A South Campus", code: "a-south" });
    expect(created.code).toBe("A-SOUTH");

    const events = await withTenant(db, adminA, (tx) => tx.select().from(auditEvents));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "branch.create",
      schoolId: t.schoolA.id,
      actorUserId: t.users.adminA,
      targetId: created.id,
      outcome: "success",
    });
    expect(await withTenant(db, adminB, (tx) => tx.select().from(auditEvents))).toHaveLength(0);
  });

  it("is append-only: runtime role cannot update or delete, and the owner is blocked too", async () => {
    await createBranch(db, adminA, { name: "A South Campus", code: "A-SOUTH" });
    await expectDbError(
      withTenant(db, adminA, (tx) => tx.update(auditEvents).set({ action: "tampered" })),
      /permission denied/i,
    );
    await expectDbError(
      withTenant(db, adminA, (tx) => tx.delete(auditEvents)),
      /permission denied/i,
    );
    await expectDbError(ownerQuery(`update audit_events set action = 'tampered'`), /append-only/);
    await expectDbError(ownerQuery(`delete from audit_events`), /append-only/);
  });
});
