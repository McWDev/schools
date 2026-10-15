import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { Badge, buttonClass, Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { getRequestBranch, requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { listStudents, STUDENT_STATUSES } from "@/server/modules/students/service";

import { statusLabel, statusTone } from "./status";
import { StudentPhoto } from "./student-photo";

export const metadata: Metadata = { title: "Students · School Management" };

export default function StudentsPage(props: PageProps<"/dashboard/students">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading students…</p>}>
      <StudentsContent searchParams={props.searchParams} />
    </Suspense>
  );
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function StudentsContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard/students">["searchParams"];
}) {
  const { access } = await requireAccess();
  if (!hasPermission(access, "students.read")) return <NoAccess />;
  const [query, activeBranch] = await Promise.all([searchParams, getRequestBranch()]);
  const search = single(query.q).slice(0, 80);
  const status = STUDENT_STATUSES.find((value) => value === single(query.status)) ?? "";
  const students = await listStudents(getDatabase(), access, {
    branchId: activeBranch?.id,
    search,
    status: status || null,
    limit: 200,
  });
  const canAdmit = hasPermission(access, "students.create");

  return (
    <>
      <PageHeader
        title="Students"
        description={
          activeBranch
            ? `Students at ${activeBranch.name}.`
            : access.scope.kind === "school"
              ? "Students across every branch."
              : "Students in your branches."
        }
        actions={
          canAdmit && (
            <Link href="/dashboard/students/new" className={buttonClass("primary")}>
              <Icon name="user-plus" />
              Admit student
            </Link>
          )
        }
      />

      <form role="search" className="flex flex-wrap items-end gap-3" action="/dashboard/students">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="student-search" className="text-sm font-medium">
            Search
          </label>
          <input
            id="student-search"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Name or student number"
            className="border-border bg-surface placeholder:text-subtle focus:border-primary focus:ring-primary/20 h-10 rounded-lg border px-3 text-sm outline-none focus:ring-4"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="student-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="student-status"
            name="status"
            defaultValue={status}
            className="border-border bg-surface focus:border-primary focus:ring-primary/20 h-10 rounded-lg border px-3 text-sm outline-none focus:ring-4"
          >
            <option value="">Any status</option>
            {STUDENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Search
        </button>
      </form>

      <Card>
        {students.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="bg-accent-soft text-accent grid size-12 place-items-center rounded-full">
              <Icon name="users" className="size-6" />
            </span>
            <p className="font-medium">
              {search || status ? "No students match" : "No students yet"}
            </p>
            <p className="text-muted max-w-sm text-sm">
              {search || status
                ? "Try a different name, number, or status."
                : canAdmit
                  ? "Admit your first student to start their record."
                  : "Students will appear here once they are admitted."}
            </p>
          </div>
        ) : (
          <div className="-m-5 overflow-x-auto sm:-m-6">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Students</caption>
              <thead className="text-muted border-border border-b text-xs">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">
                    Student
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Number
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Branch
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Class
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-surface-muted">
                    <td className="px-5 py-3 sm:px-6">
                      <Link
                        href={`/dashboard/students/${student.id}`}
                        className="hover:text-primary flex items-center gap-3 font-medium"
                      >
                        <StudentPhoto
                          studentId={student.id}
                          name={`${student.firstName} ${student.lastName}`}
                          hasPhoto={student.hasPhoto}
                          size={32}
                        />
                        {student.firstName} {student.lastName}
                      </Link>
                    </td>
                    <td className="text-muted px-3 py-3 tabular-nums">{student.studentNumber}</td>
                    <td className="text-muted px-3 py-3">{student.branchName}</td>
                    <td className="text-muted px-3 py-3">
                      {student.className
                        ? `${student.className} ${student.sectionName}`
                        : "Not placed"}
                    </td>
                    <td className="px-5 py-3 sm:px-6">
                      <Badge tone={statusTone(student.status)}>{statusLabel(student.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
