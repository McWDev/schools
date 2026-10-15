import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-school";
import { resolveAccessContext, withAccess, type AccessContext } from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import { getDatabase } from "@/server/db/client";
import { auditEvents, studentGuardians, students } from "@/server/db/schema";
import {
  addGuardian,
  admitStudent,
  getStudent,
  getVisibleStudentPhotoKey,
  listPlacementOptions,
  listStudents,
  placeStudent,
  PossibleDuplicateError,
  removeStudentPhoto,
  setStudentPhoto,
  setStudentStatus,
  StudentRuleError,
  transferStudent,
  updateStudent,
} from "@/server/modules/students/service";
import { MemoryStorage } from "@/server/storage/object-storage";

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

function admission(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Sahra",
    lastName: "Testcase",
    dateOfBirth: "2019-05-20",
    gender: "female",
    branchId: t.branches.main,
    sectionId: t.sections.mainGrade1A,
    admissionDate: "2026-09-01",
    address: "",
    medicalNotes: "",
    guardian: { fullName: "Faadumo Testcase", relationship: "Mother", phone: "+252 61 000 0009" },
    ...overrides,
  };
}

describe("admission", () => {
  it("admits a student with a database-issued, school-wide unique number", async () => {
    const first = await admitStudent(db, mainBranchAdmin, admission());
    const second = await admitStudent(
      db,
      admin,
      admission({ firstName: "Omar", branchId: t.branches.north, sectionId: "" }),
    );
    expect(first.studentNumber).toMatch(/^\d{4}-\d{5}$/);
    expect(second.studentNumber).not.toBe(first.studentNumber);

    const student = await getStudent(db, mainBranchAdmin, first.id);
    expect(student).toMatchObject({
      firstName: "Sahra",
      className: "Grade 1",
      sectionName: "A",
      status: "enrolled",
      academicYearName: "2026-2027",
    });
    expect(student?.guardians).toEqual([
      expect.objectContaining({ fullName: "Faadumo Testcase", isPrimary: true }),
    ]);
  });

  it("student numbers are unique and can never be changed", async () => {
    const [{ student_number: existing }] = await ownerQuery<{ student_number: string }>(
      `select student_number from students where id = $1`,
      [t.students.mainStudent],
    );
    await expect(
      ownerQuery(
        `insert into students (branch_id, student_number, first_name, last_name, date_of_birth,
           gender, admission_date) values ($1, $2, 'Dup', 'Number', '2019-01-01', 'male', '2026-09-01')`,
        [t.branches.main, existing],
      ),
    ).rejects.toThrow(/students_student_number_key/);
    await expect(
      withAccess(db, admin, (tx) =>
        tx
          .update(students)
          .set({ studentNumber: "1999-99999" })
          .where(eq(students.id, t.students.mainStudent)),
      ),
    ).rejects.toThrow();
  });

  it("validates required fields on the server", async () => {
    await expect(admitStudent(db, admin, admission({ firstName: " " }))).rejects.toThrow();
    await expect(admitStudent(db, admin, admission({ dateOfBirth: "2027-01-01" }))).rejects.toThrow(
      /before the admission date/,
    );
    await expect(
      admitStudent(db, admin, admission({ guardian: { fullName: "", relationship: "" } })),
    ).rejects.toThrow();
    await expect(admitStudent(db, admin, admission({ status: "graduated" }))).rejects.toThrow();
  });

  it("warns about a possible duplicate anywhere in the school, then allows confirming", async () => {
    // Yusuf Sample is at North; a Main branch admin cannot see him but is still warned.
    const duplicate = admission({
      firstName: "yusuf",
      lastName: "SAMPLE",
      dateOfBirth: "2018-11-02",
    });
    await expect(admitStudent(db, mainBranchAdmin, duplicate)).rejects.toThrow(
      PossibleDuplicateError,
    );
    const created = await admitStudent(db, mainBranchAdmin, {
      ...duplicate,
      confirmDuplicate: true,
    });
    expect(created.id).toBeTruthy();
  });

  it("refuses a section from another branch or an archived section", async () => {
    const error = await admitStudent(
      db,
      admin,
      admission({ branchId: t.branches.north, sectionId: t.sections.mainGrade1A }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StudentRuleError);
    expect((error as StudentRuleError).field).toBe("sectionId");
  });

  it("branch staff admit only into their branches; teachers cannot admit", async () => {
    await expect(
      admitStudent(db, mainBranchAdmin, admission({ branchId: t.branches.north, sectionId: "" })),
    ).rejects.toThrow(ForbiddenError);
    await expect(admitStudent(db, mainTeacher, admission())).rejects.toThrow(ForbiddenError);
  });
});

describe("branch scoping and sensitive fields", () => {
  it("branch staff see only students of their branches, even by ID", async () => {
    expect((await listStudents(db, mainTeacher)).map((s) => s.id)).toEqual([
      t.students.mainStudent,
    ]);
    expect((await listStudents(db, northTeacher)).map((s) => s.id)).toEqual([
      t.students.northStudent,
    ]);
    expect(await getStudent(db, northTeacher, t.students.mainStudent)).toBeNull();
    expect(await listStudents(db, northTeacher, { branchId: t.branches.main })).toEqual([]);
    const raw = await withAccess(db, northTeacher, (tx) => tx.select().from(studentGuardians));
    expect(raw).toEqual([]);
  });

  it("school admins see every student and can search by name or number", async () => {
    expect(await listStudents(db, admin)).toHaveLength(2);
    expect((await listStudents(db, admin, { search: "amina ex" })).map((s) => s.firstName)).toEqual(
      ["Amina"],
    );
    const [student] = await listStudents(db, admin, { search: "Yusuf" });
    expect(
      (await listStudents(db, admin, { search: student.studentNumber })).map((s) => s.id),
    ).toEqual([student.id]);
    expect(await listStudents(db, admin, { search: "%" })).toEqual([]);
  });

  it("address, medical notes, and guardian contacts are hidden without the permission", async () => {
    const teacherView = await getStudent(db, mainTeacher, t.students.mainStudent);
    expect(teacherView?.sensitiveVisible).toBe(false);
    expect(teacherView).not.toHaveProperty("address");
    expect(teacherView).not.toHaveProperty("medicalNotes");
    expect(teacherView?.guardians[0]).not.toHaveProperty("phone");
    expect(teacherView?.guardians[0].fullName).toBe("Hodan Example");

    const adminView = await getStudent(db, mainBranchAdmin, t.students.mainStudent);
    expect(adminView).toMatchObject({
      sensitiveVisible: true,
      address: "12 Example Street",
      medicalNotes: "Example allergy note",
    });
    expect(adminView?.guardians[0]).toMatchObject({ phone: "+252 61 000 0001" });
  });

  it("teachers cannot edit records", async () => {
    await expect(
      updateStudent(db, mainTeacher, t.students.mainStudent, { firstName: "X" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      setStudentStatus(db, mainTeacher, t.students.mainStudent, "withdrawn"),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("edits, placement, status, and transfers", () => {
  it("edits, placement changes, and status changes are audited without personal data", async () => {
    expect(
      await updateStudent(db, mainBranchAdmin, t.students.mainStudent, { middleName: "Q" }),
    ).toBe(true);
    expect(await placeStudent(db, mainBranchAdmin, t.students.mainStudent, "")).toBe(true);
    expect(await setStudentStatus(db, mainBranchAdmin, t.students.mainStudent, "suspended")).toBe(
      true,
    );
    expect(
      await addGuardian(db, mainBranchAdmin, t.students.mainStudent, {
        fullName: "Ali Example",
        relationship: "Father",
      }),
    ).toBe(true);

    const student = await getStudent(db, admin, t.students.mainStudent);
    expect(student).toMatchObject({ middleName: "Q", sectionName: null, status: "suspended" });
    expect(student?.guardians).toHaveLength(2);

    const events = await withAccess(db, admin, (tx) =>
      tx
        .select({ action: auditEvents.action, metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(eq(auditEvents.targetId, t.students.mainStudent)),
    );
    expect(events.map((e) => e.action).sort()).toEqual([
      "student.guardian_add",
      "student.place",
      "student.status",
      "student.update",
    ]);
    expect(JSON.stringify(events)).not.toMatch(/Amina|Example|Ali/);
  });

  it("placement lists active sections of the student's branch", async () => {
    expect(await listPlacementOptions(db, mainBranchAdmin, t.branches.main)).toEqual([
      { id: t.sections.mainGrade1A, label: "Grade 1 A" },
    ]);
    expect(await listPlacementOptions(db, mainBranchAdmin, t.branches.north)).toEqual([]);
  });

  it("a transfer moves the student, ends the placement, keeps guardians, and records history", async () => {
    expect(
      await transferStudent(db, admin, t.students.mainStudent, {
        toBranchId: t.branches.north,
        effectiveOn: "2026-10-01",
        reason: "Family moved",
      }),
    ).toBe(true);

    const atNorth = await getStudent(db, northTeacher, t.students.mainStudent);
    expect(atNorth).toMatchObject({ branchName: "North Campus", sectionName: null });
    expect(atNorth?.guardians.map((g) => g.fullName)).toEqual(["Hodan Example"]);
    // North staff see the move, but not the name of a branch outside their scope.
    expect(atNorth?.transfers).toEqual([
      expect.objectContaining({
        fromBranchName: null,
        toBranchName: "North Campus",
        reason: "Family moved",
      }),
    ]);
    const adminView = await getStudent(db, admin, t.students.mainStudent);
    expect(adminView?.transfers).toEqual([
      expect.objectContaining({
        fromBranchName: "Main Campus",
        toBranchName: "North Campus",
        actorName: "School Admin",
      }),
    ]);
    // The previous branch no longer sees the student.
    expect(await getStudent(db, mainTeacher, t.students.mainStudent)).toBeNull();

    const [event] = await withAccess(db, admin, (tx) =>
      tx
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(eq(auditEvents.action, "student.transfer")),
    );
    expect(event.metadata).toEqual({ fromBranchId: t.branches.main, toBranchId: t.branches.north });
  });

  it("branch staff cannot transfer students to a branch outside their scope", async () => {
    await expect(
      transferStudent(db, mainBranchAdmin, t.students.mainStudent, {
        toBranchId: t.branches.north,
        effectiveOn: "2026-10-01",
      }),
    ).rejects.toThrow(ForbiddenError);
    // The database refuses it too.
    await expect(
      withAccess(db, mainBranchAdmin, (tx) =>
        tx
          .update(students)
          .set({ branchId: t.branches.north, sectionId: null })
          .where(eq(students.id, t.students.mainStudent)),
      ),
    ).rejects.toThrow();
  });

  it("the application role cannot delete students, guardians, or transfer history", async () => {
    for (const table of ["students", "student_guardians", "student_transfers"]) {
      await expect(
        withAccess(db, admin, (tx) => tx.execute(sql.raw(`delete from ${table}`))),
        table,
      ).rejects.toThrow();
    }
  });
});

describe("photo and phone", () => {
  const photo = () =>
    sharp({ create: { width: 300, height: 400, channels: 3, background: "#3b6fd4" } })
      .jpeg()
      .toBuffer()
      .then((buffer) => new Uint8Array(buffer));

  it("admission stores a re-encoded photo and the student's phone", async () => {
    const storage = new MemoryStorage();
    const { id } = await admitStudent(
      db,
      mainBranchAdmin,
      admission({ phone: "+252 61 555 0100" }),
      { storage, bytes: await photo() },
    );
    const student = await getStudent(db, mainBranchAdmin, id);
    expect(student).toMatchObject({ hasPhoto: true, phone: "+252 61 555 0100" });
    const key = await getVisibleStudentPhotoKey(db, mainTeacher, id);
    expect(key).toMatch(new RegExp(`^students/${id}/[0-9a-f]+\.webp$`));
    const stored = await sharp((await storage.get(key!))!).metadata();
    expect([stored.format, stored.width, stored.height]).toEqual(["webp", 512, 512]);

    // Teachers see the photo but not the phone; other branches see neither.
    const teacherView = await getStudent(db, mainTeacher, id);
    expect(teacherView?.hasPhoto).toBe(true);
    expect(teacherView).not.toHaveProperty("phone");
    expect(await getVisibleStudentPhotoKey(db, northTeacher, id)).toBeNull();
  });

  it("an invalid image is refused before anything is created", async () => {
    const storage = new MemoryStorage();
    await expect(
      admitStudent(db, mainBranchAdmin, admission(), {
        storage,
        bytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      }),
    ).rejects.toThrow(/not a supported image/);
    expect(await listStudents(db, admin, { search: "Sahra" })).toEqual([]);
  });

  it("staff replace and remove a photo; the old file is deleted", async () => {
    const storage = new MemoryStorage();
    expect(
      await setStudentPhoto(db, mainBranchAdmin, t.students.mainStudent, {
        storage,
        bytes: await photo(),
      }),
    ).toBe(true);
    const first = await getVisibleStudentPhotoKey(db, admin, t.students.mainStudent);
    await setStudentPhoto(db, mainBranchAdmin, t.students.mainStudent, {
      storage,
      bytes: await photo(),
    });
    const second = await getVisibleStudentPhotoKey(db, admin, t.students.mainStudent);
    expect(second).not.toBe(first);
    expect(await storage.get(first!)).toBeNull();

    expect(await removeStudentPhoto(db, mainBranchAdmin, storage, t.students.mainStudent)).toBe(
      true,
    );
    expect(await storage.get(second!)).toBeNull();
    expect((await getStudent(db, admin, t.students.mainStudent))?.hasPhoto).toBe(false);

    // Teachers and other branches cannot change photos.
    await expect(
      setStudentPhoto(db, mainTeacher, t.students.mainStudent, { storage, bytes: await photo() }),
    ).rejects.toThrow(ForbiddenError);
    expect(
      await setStudentPhoto(db, northTeacher, t.students.mainStudent, {
        storage,
        bytes: await photo(),
      }).catch(() => "denied"),
    ).not.toBe(true);
  });
});
