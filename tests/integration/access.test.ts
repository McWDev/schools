import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { SyntheticSchool } from "../../scripts/lib/synthetic-school";
import { resolveAccessContext, withAccess, type AccessContext } from "@/server/access/context";
import { AccessDeniedError, ForbiddenError } from "@/server/access/errors";
import { createDatabase, getDatabase, type DatabaseHandle } from "@/server/db/client";
import { auditEvents, branches, schoolSettings, userBranches } from "@/server/db/schema";
import {
  createBranch,
  DuplicateBranchCodeError,
  getBranch,
  listBranches,
  updateBranch,
} from "@/server/modules/branches/service";

import { closeOwner, ownerQuery, resetSchool, runtimeUrl } from "./helpers";

const db = getDatabase();
const extraPools: DatabaseHandle[] = [];

let t: SyntheticSchool;
let admin: AccessContext;
let mainTeacher: AccessContext;
let mainBranchAdmin: AccessContext;
let northTeacher: AccessContext;

// Seeded IDs are fixed, so contexts resolved once stay valid after each re-seed. Tests that change
// a person's access resolve a fresh context themselves.
beforeAll(async () => {
  t = await resetSchool();
  [admin, mainTeacher, mainBranchAdmin, northTeacher] = await Promise.all(
    [t.users.admin, t.users.mainTeacher, t.users.mainBranchAdmin, t.users.northTeacher].map((id) =>
      resolveAccessContext(db, id),
    ),
  );
});

beforeEach(async () => {
  await resetSchool();
});

afterAll(async () => {
  await Promise.all(extraPools.map((handle) => handle.pool.end()));
  await closeOwner();
});

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

describe("missing access context fails closed", () => {
  it("returns no rows from protected tables without a signed-in user", async () => {
    for (const table of [
      "branches",
      "roles",
      "role_permissions",
      "user_roles",
      "user_branches",
      "audit_events",
      "user_invitations",
    ]) {
      expect(await countWithoutContext(table), table).toBe(0);
    }
  });

  it("still exposes the public school name for the sign-in page", async () => {
    const rows = await db.select({ name: schoolSettings.name }).from(schoolSettings);
    expect(rows).toEqual([{ name: "Example Academy" }]);
  });

  it("rejects undefined and forged context objects", async () => {
    await expect(
      withAccess(db, undefined as unknown as AccessContext, async () => 1),
    ).rejects.toThrow(AccessDeniedError);
    const forged = {
      userId: t.users.northTeacher,
      scope: { kind: "school" },
      permissions: ["branches.read", "branches.manage"],
    } as AccessContext;
    await expect(listBranches(db, forged)).rejects.toThrow(AccessDeniedError);
  });

  it("cannot mutate an issued context to widen its scope", () => {
    expect(() => {
      (mainTeacher as { scope: unknown }).scope = { kind: "school" };
    }).toThrow(TypeError);
    expect(() => {
      (mainTeacher.permissions as string[]).push("branches.manage");
    }).toThrow(TypeError);
  });
});

describe("access resolution", () => {
  it("denies deactivated, suspended, and not-yet-activated accounts", async () => {
    for (const status of ["deactivated", "suspended", "invited"]) {
      await ownerQuery(`update users set status = $1 where id = $2`, [status, t.users.mainTeacher]);
      await expect(resolveAccessContext(db, t.users.mainTeacher), status).rejects.toThrow(
        AccessDeniedError,
      );
    }
  });

  it("rejects malformed IDs before touching the database", async () => {
    await expect(resolveAccessContext(db, "1 or 1=1")).rejects.toThrow(AccessDeniedError);
  });

  it("resolves scope and permissions from the database", () => {
    expect(admin.scope).toEqual({ kind: "school" });
    expect(admin.permissions).toContain("branches.manage");
    expect(mainTeacher.scope).toEqual({ kind: "branch", branchIds: [t.branches.main] });
    expect(mainTeacher.permissions).toEqual(["branches.read"]);
  });

  it("removing a branch assignment removes access on the next resolution", async () => {
    await ownerQuery(`delete from user_branches where user_id = $1`, [t.users.mainTeacher]);
    const fresh = await resolveAccessContext(db, t.users.mainTeacher);
    expect(await listBranches(db, fresh)).toEqual([]);
    expect(await getBranch(db, fresh, t.branches.main)).toBeNull();
  });
});

describe("branch isolation", () => {
  it("school admin sees every branch", async () => {
    expect((await listBranches(db, admin)).map((b) => b.code)).toEqual(["MAIN", "NORTH"]);
  });

  it("branch staff see only their assigned branch", async () => {
    expect((await listBranches(db, mainTeacher)).map((b) => b.code)).toEqual(["MAIN"]);
    expect((await listBranches(db, northTeacher)).map((b) => b.code)).toEqual(["NORTH"]);
  });

  it("guessing another branch's ID returns not found", async () => {
    expect(await getBranch(db, mainTeacher, t.branches.north)).toBeNull();
  });

  it("cannot update a branch outside the user's scope", async () => {
    const mainManager = await resolveAccessContext(db, t.users.mainBranchAdmin);
    expect(await updateBranch(db, mainManager, t.branches.north, { name: "Hijacked" })).toBeNull();
    const [row] = await ownerQuery<{ name: string }>(`select name from branches where id = $1`, [
      t.branches.north,
    ]);
    expect(row.name).toBe("North Campus");
  });

  it("row-level security hides other branches even if a query forgets to filter", async () => {
    const rows = await withAccess(db, mainTeacher, (tx) =>
      tx.select({ id: branches.id }).from(branches),
    );
    expect(rows.map((r) => r.id)).toEqual([t.branches.main]);
  });

  it("row-level security blocks raw updates of other branches", async () => {
    const updated = await withAccess(db, mainTeacher, (tx) =>
      tx
        .update(branches)
        .set({ name: "Hijacked" })
        .where(sql`${branches.id} = ${t.branches.north}`)
        .returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("only school-wide staff can open branches, even with raw queries", async () => {
    await expect(createBranch(db, mainTeacher, { name: "Rogue", code: "ROGUE" })).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      createBranch(db, mainBranchAdmin, { name: "Rogue", code: "ROGUE" }),
    ).rejects.toThrow(ForbiddenError);
    await expectDbError(
      withAccess(db, mainBranchAdmin, (tx) =>
        tx.insert(branches).values({ name: "Rogue", code: "ROGUE" }),
      ),
      /row-level security/i,
    );
  });

  it("a branch admin cannot assign anyone to a branch outside their scope, even raw", async () => {
    await expectDbError(
      withAccess(db, mainBranchAdmin, (tx) =>
        tx.insert(userBranches).values({ userId: t.users.mainTeacher, branchId: t.branches.north }),
      ),
      /row-level security/i,
    );
  });

  it("rejects unexpected fields in branch payloads", async () => {
    await expect(
      createBranch(db, admin, { name: "East Campus", code: "EAST", status: "inactive" }),
    ).rejects.toThrow();
    expect(await ownerQuery(`select 1 from branches where code = 'EAST'`)).toHaveLength(0);
  });

  it("branch codes are unique (case-insensitive, as codes are upper-cased)", async () => {
    await expect(createBranch(db, admin, { name: "Main Again", code: "main" })).rejects.toThrow(
      DuplicateBranchCodeError,
    );
  });

  it("records the area a new branch serves", async () => {
    const created = await createBranch(db, admin, {
      name: "East Campus",
      code: "east",
      area: "East District",
    });
    expect(created).toMatchObject({ code: "EAST", area: "East District", status: "active" });
  });
});

describe("school profile", () => {
  it("is a single row: a second school cannot be added", async () => {
    await expectDbError(
      ownerQuery(`insert into school_settings (id, name) values (2, 'Second School')`),
      /school_settings_singleton|23514/,
    );
    await expectDbError(
      ownerQuery(`insert into school_settings (id, name) values (1, 'Duplicate')`),
      /23505|duplicate/i,
    );
  });

  it("cannot be changed without a signed-in user", async () => {
    const result = await db.execute(sql`update school_settings set name = 'Hijacked' returning id`);
    expect(result.rows).toHaveLength(0);
  });
});

describe("pooled connections do not leak access context", () => {
  it("context is cleared after commit and after rollback on the same connection", async () => {
    const single = createDatabase(runtimeUrl(), { max: 1 });
    extraPools.push(single);

    await withAccess(single.db, admin, (tx) => tx.select().from(branches));
    const afterCommit = await single.db.execute<{ user: string | null; n: number }>(
      sql`select current_setting('app.user_id', true) as user, (select count(*)::int from branches) as n`,
    );
    expect(afterCommit.rows[0].n).toBe(0);
    expect(afterCommit.rows[0].user ?? "").toBe("");

    await expect(
      withAccess(single.db, admin, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const afterRollback = await single.db.execute<{ n: number }>(
      sql`select count(*)::int as n from branches`,
    );
    expect(afterRollback.rows[0].n).toBe(0);
  });

  it("concurrent requests for different users only ever see their own branches", async () => {
    const small = createDatabase(runtimeUrl(), { max: 3 });
    extraPools.push(small);
    const contexts = [admin, mainTeacher, northTeacher];
    const expected = new Map([
      [admin, new Set([t.branches.main, t.branches.north])],
      [mainTeacher, new Set([t.branches.main])],
      [northTeacher, new Set([t.branches.north])],
    ]);

    const runs = Array.from({ length: 30 }, (_, i) => {
      const context = contexts[i % contexts.length];
      return withAccess(small.db, context, async (tx) => {
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
  it("records branch creation in the same transaction", async () => {
    const created = await createBranch(db, admin, { name: "East Campus", code: "EAST" });
    const events = await withAccess(db, admin, (tx) => tx.select().from(auditEvents));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "branch.create",
      actorUserId: t.users.admin,
      targetId: created.id,
      branchId: created.id,
      outcome: "success",
    });
  });

  it("branch staff cannot read events tied to other branches", async () => {
    await ownerQuery(
      `insert into audit_events (branch_id, action, outcome) values ($1, 'x.main', 'success'), ($2, 'x.north', 'success')`,
      [t.branches.main, t.branches.north],
    );
    const seen = await withAccess(db, mainTeacher, (tx) =>
      tx.select({ action: auditEvents.action }).from(auditEvents),
    );
    expect(seen.map((e) => e.action)).toEqual(["x.main"]);
  });

  it("is append-only: the runtime role cannot update or delete, and the owner is blocked too", async () => {
    await createBranch(db, admin, { name: "East Campus", code: "EAST" });
    await expectDbError(
      withAccess(db, admin, (tx) => tx.update(auditEvents).set({ action: "tampered" })),
      /permission denied/i,
    );
    await expectDbError(
      withAccess(db, admin, (tx) => tx.delete(auditEvents)),
      /permission denied/i,
    );
    await expectDbError(ownerQuery(`update audit_events set action = 'tampered'`), /append-only/);
    await expectDbError(ownerQuery(`delete from audit_events`), /append-only/);
  });
});
