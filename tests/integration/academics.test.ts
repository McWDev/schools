import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-school";
import { resolveAccessContext, withAccess, type AccessContext } from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import { getDatabase } from "@/server/db/client";
import { academicYears, auditEvents, sections } from "@/server/db/schema";
import {
  AcademicConflictError,
  createAcademicYear,
  createClass,
  createGradeLevel,
  createSection,
  createTerm,
  getClass,
  listAcademicYears,
  listClasses,
  listGradeLevels,
  setAcademicYearStatus,
  setClassStatus,
  setCurrentAcademicYear,
  setGradeLevelStatus,
  setSectionStatus,
  updateAcademicYear,
  updateSection,
} from "@/server/modules/academics/service";

import { closeOwner, resetSchool } from "./helpers";

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

async function conflictField(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AcademicConflictError);
  return (error as AcademicConflictError).field;
}

describe("school-wide structure: years, terms, grade levels", () => {
  it("school admin sets up a new year with terms; years list newest first", async () => {
    const year = await createAcademicYear(db, admin, {
      name: "2027-2028",
      startsOn: "2027-09-01",
      endsOn: "2028-06-30",
    });
    await createTerm(db, admin, year.id, {
      name: "Semester 1",
      sequence: "1",
      startsOn: "2027-09-01",
      endsOn: "2028-01-31",
    });
    const years = await listAcademicYears(db, admin);
    expect(years.map((y) => y.name)).toEqual(["2027-2028", "2026-2027"]);
    expect(years[0]).toMatchObject({ isCurrent: false, status: "active" });
    expect(years[0].terms.map((term) => term.name)).toEqual(["Semester 1"]);
    expect(years[1].terms.map((term) => term.name)).toEqual(["Term 1", "Term 2", "Term 3"]);
  });

  it("exactly one year is current; switching unmarks the previous one", async () => {
    const next = await createAcademicYear(db, admin, {
      name: "2027-2028",
      startsOn: "2027-09-01",
      endsOn: "2028-06-30",
    });
    expect(await setCurrentAcademicYear(db, admin, next.id)).toBe(true);
    const years = await listAcademicYears(db, admin);
    expect(years.filter((y) => y.isCurrent).map((y) => y.name)).toEqual(["2027-2028"]);
  });

  it("the current year cannot be archived, and an archived year cannot become current", async () => {
    expect(await conflictField(setAcademicYearStatus(db, admin, t.academicYear, "archived"))).toBe(
      "form",
    );
    const old = await createAcademicYear(db, admin, {
      name: "2025-2026",
      startsOn: "2025-09-01",
      endsOn: "2026-06-30",
    });
    await setAcademicYearStatus(db, admin, old.id, "archived");
    expect(await conflictField(setCurrentAcademicYear(db, admin, old.id))).toBe("form");
    expect(await conflictField(createTerm(db, admin, old.id, termInput()))).toBe("form");
  });

  it("rejects terms outside their year and year dates that would orphan terms", async () => {
    const field = await conflictField(
      createTerm(db, admin, t.academicYear, {
        name: "Summer",
        sequence: 4,
        startsOn: "2027-06-01",
        endsOn: "2027-08-15",
      }),
    );
    expect(field).toBe("startsOn");
    expect(
      await conflictField(
        updateAcademicYear(db, admin, t.academicYear, {
          name: "2026-2027",
          startsOn: "2026-10-01",
          endsOn: "2027-06-30",
        }),
      ),
    ).toBe("startsOn");
  });

  it("duplicates are reported per field: year name, term name and position, grade name and code", async () => {
    expect(
      await conflictField(
        createAcademicYear(db, admin, {
          name: "2026-2027",
          startsOn: "2030-09-01",
          endsOn: "2031-06-30",
        }),
      ),
    ).toBe("name");
    expect(
      await conflictField(
        createTerm(db, admin, t.academicYear, { ...termInput(), name: "Term 1" }),
      ),
    ).toBe("name");
    expect(
      await conflictField(createTerm(db, admin, t.academicYear, { ...termInput(), sequence: 2 })),
    ).toBe("sequence");
    expect(
      await conflictField(
        createGradeLevel(db, admin, { name: "Grade One", code: "g1", sortOrder: 9 }),
      ),
    ).toBe("code");
    expect(
      await conflictField(
        createGradeLevel(db, admin, { name: "Grade 1", code: "X1", sortOrder: 9 }),
      ),
    ).toBe("name");
  });

  it("only school-wide administrators configure the structure", async () => {
    for (const actor of [mainBranchAdmin, mainTeacher]) {
      await expect(
        createAcademicYear(db, actor, {
          name: "2030-2031",
          startsOn: "2030-09-01",
          endsOn: "2031-06-30",
        }),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        createGradeLevel(db, actor, { name: "Grade 9", code: "G9", sortOrder: 9 }),
      ).rejects.toThrow(ForbiddenError);
      await expect(setCurrentAcademicYear(db, actor, t.academicYear)).rejects.toThrow(
        ForbiddenError,
      );
    }
  });

  it("the database refuses structure writes from branch-scoped sessions", async () => {
    await expect(
      withAccess(db, mainBranchAdmin, (tx) =>
        tx
          .insert(academicYears)
          .values({ name: "Rogue", startsOn: "2030-01-01", endsOn: "2030-12-31" }),
      ),
    ).rejects.toThrow();
    const updated = await withAccess(db, mainBranchAdmin, (tx) =>
      tx
        .update(academicYears)
        .set({ name: "Renamed" })
        .where(eq(academicYears.id, t.academicYear))
        .returning({ id: academicYears.id }),
    );
    expect(updated).toEqual([]);
  });

  it("every signed-in role can read the structure", async () => {
    const [years, grades] = await Promise.all([
      listAcademicYears(db, northTeacher),
      listGradeLevels(db, northTeacher),
    ]);
    expect(years.map((y) => y.name)).toEqual(["2026-2027"]);
    expect(grades.map((g) => g.code)).toEqual(["G1", "G2"]);
  });
});

describe("classes and sections inside branches", () => {
  it("branch admin opens a class and sections in their own branch", async () => {
    const created = await createClass(db, mainBranchAdmin, {
      branchId: t.branches.main,
      academicYearId: t.academicYear,
      gradeLevelId: t.grades.grade2,
      name: "",
    });
    await createSection(db, mainBranchAdmin, created.id, { name: "A", capacity: "35", room: "" });
    await createSection(db, mainBranchAdmin, created.id, { name: "B", capacity: "", room: "Lab" });
    const view = await getClass(db, mainBranchAdmin, created.id);
    expect(view).toMatchObject({
      name: "Grade 2",
      branchName: "Main Campus",
      gradeLevelName: "Grade 2",
    });
    expect(view?.sections.map((s) => [s.name, s.capacity, s.room])).toEqual([
      ["A", 35, null],
      ["B", null, "Lab"],
    ]);
  });

  it("branch staff cannot create classes in other branches; teachers cannot manage classes", async () => {
    await expect(
      createClass(db, mainBranchAdmin, {
        branchId: t.branches.north,
        academicYearId: t.academicYear,
        gradeLevelId: t.grades.grade1,
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      createClass(db, mainTeacher, {
        branchId: t.branches.main,
        academicYearId: t.academicYear,
        gradeLevelId: t.grades.grade2,
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      createSection(db, mainTeacher, t.classes.mainGrade1, { name: "Z" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("classes in other branches are invisible, even by ID", async () => {
    expect((await listClasses(db, mainTeacher)).map((c) => c.id)).toEqual([t.classes.mainGrade1]);
    expect(await listClasses(db, northTeacher)).toEqual([]);
    expect(await listClasses(db, northTeacher, { branchId: t.branches.main })).toEqual([]);
    expect(await getClass(db, northTeacher, t.classes.mainGrade1)).toBeNull();
    expect(await createSection(db, mainBranchAdmin, "not-a-uuid", { name: "C" })).toBeNull();
    const rows = await withAccess(db, northTeacher, (tx) => tx.select().from(sections));
    expect(rows).toEqual([]);
  });

  it("one class per grade, branch, and year; the same grade may exist at another branch", async () => {
    const input = {
      branchId: t.branches.main,
      academicYearId: t.academicYear,
      gradeLevelId: t.grades.grade1,
    };
    expect(await conflictField(createClass(db, admin, input))).toBe("gradeLevelId");
    await expect(
      createClass(db, admin, { ...input, branchId: t.branches.north }),
    ).resolves.toHaveProperty("id");
    expect(await conflictField(createSection(db, admin, t.classes.mainGrade1, { name: "A" }))).toBe(
      "name",
    );
  });

  it("archived grades and years cannot receive new classes", async () => {
    await setGradeLevelStatus(db, admin, t.grades.grade2, "archived");
    expect(
      await conflictField(
        createClass(db, admin, {
          branchId: t.branches.main,
          academicYearId: t.academicYear,
          gradeLevelId: t.grades.grade2,
        }),
      ),
    ).toBe("gradeLevelId");
  });

  it("archiving keeps the class and its sections listed, and can be undone", async () => {
    expect(await setSectionStatus(db, mainBranchAdmin, t.sections.mainGrade1A, "archived")).toBe(
      true,
    );
    expect(await setClassStatus(db, mainBranchAdmin, t.classes.mainGrade1, "archived")).toBe(true);
    let view = await getClass(db, admin, t.classes.mainGrade1);
    expect(view?.status).toBe("archived");
    expect(view?.sections.map((s) => s.status)).toEqual(["archived"]);

    await setClassStatus(db, mainBranchAdmin, t.classes.mainGrade1, "active");
    view = await getClass(db, admin, t.classes.mainGrade1);
    expect(view?.status).toBe("active");

    // Out-of-scope staff cannot archive another branch's records.
    expect(await setClassStatus(db, northTeacher, t.classes.mainGrade1, "archived")).toBe(false);
    expect(await updateSection(db, northTeacher, t.sections.mainGrade1A, { name: "Q" })).toBe(
      false,
    );
  });

  it("the application role cannot delete academic records", async () => {
    for (const table of ["sections", "classes", "terms", "academic_years", "grade_levels"]) {
      await expect(
        withAccess(db, admin, (tx) => tx.execute(sql.raw(`delete from ${table}`))),
        table,
      ).rejects.toThrow();
    }
  });

  it("changes are audited with their branch", async () => {
    await createSection(db, mainBranchAdmin, t.classes.mainGrade1, { name: "B" });
    await setCurrentAcademicYear(db, admin, t.academicYear);
    const events = await withAccess(db, admin, (tx) =>
      tx.select({ action: auditEvents.action, branchId: auditEvents.branchId }).from(auditEvents),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { action: "section.create", branchId: t.branches.main },
        { action: "academic_year.set_current", branchId: null },
      ]),
    );
  });
});

function termInput() {
  return { name: "Term 4", sequence: 4, startsOn: "2027-05-01", endsOn: "2027-06-15" };
}
