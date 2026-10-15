import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge, Card, NoAccess, PageHeader } from "@/components/ui";
import { listSelectableBranches } from "@/server/access/branch-filter";
import { canAccessBranch, hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getStudent, listPlacementOptions } from "@/server/modules/students/service";

import { formatDate } from "../../academics/format";
import { statusLabel, statusTone } from "../status";
import { StudentPhoto } from "../student-photo";
import {
  EditStudentForm,
  GuardianForm,
  PlacementForm,
  StatusForm,
  StudentPhotoForm,
  TransferForm,
} from "../student-forms";

export const metadata: Metadata = { title: "Student · School Management" };

export default function StudentPage(props: PageProps<"/dashboard/students/[studentId]">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <StudentContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <p
      role="status"
      className="border-success/30 bg-success-surface text-success rounded-xl border px-4 py-3 text-sm"
    >
      {children}
    </p>
  );
}

async function StudentContent({
  params,
  searchParams,
}: {
  params: PageProps<"/dashboard/students/[studentId]">["params"];
  searchParams: PageProps<"/dashboard/students/[studentId]">["searchParams"];
}) {
  const { access } = await requireAccess();
  if (!hasPermission(access, "students.read")) return <NoAccess />;
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const db = getDatabase();
  const student = await getStudent(db, access, studentId);
  // Students of other branches are indistinguishable from students that do not exist.
  if (!student) notFound();

  const canUpdate = hasPermission(access, "students.update");
  const canTransfer = hasPermission(access, "students.transfer");
  const [placementOptions, branches] = await Promise.all([
    canUpdate ? listPlacementOptions(db, access, student.branchId) : [],
    canTransfer ? listSelectableBranches(db, access) : [],
  ]);
  const transferTargets = branches.filter(
    (branch) => branch.id !== student.branchId && canAccessBranch(access, branch.id),
  );
  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ");

  const details: [string, string][] = [
    ["Student number", student.studentNumber],
    ["Date of birth", formatDate(student.dateOfBirth)],
    ["Gender", student.gender === "female" ? "Female" : "Male"],
    ["Admitted", formatDate(student.admissionDate)],
    ["Branch", student.branchName],
    [
      "Class",
      student.className
        ? `${student.className} ${student.sectionName} (${student.academicYearName})`
        : "Not placed",
    ],
    ["Previous school", student.previousSchool ?? "Not recorded"],
  ];
  if (student.sensitiveVisible) {
    details.push(
      ["Student phone", student.phone ?? "Not recorded"],
      ["Home address", student.address ?? "Not recorded"],
      ["Medical notes", student.medicalNotes ?? "None recorded"],
    );
  }

  return (
    <>
      <PageHeader
        title={fullName}
        description={`${student.studentNumber} · ${student.branchName}`}
        backHref="/dashboard/students"
        backLabel="Students"
        actions={<Badge tone={statusTone(student.status)}>{statusLabel(student.status)}</Badge>}
      />
      {query.admitted === "1" && (
        <Notice>{`Student admitted with number ${student.studentNumber}.`}</Notice>
      )}
      {query.transferred === "1" && (
        <Notice>{`Student transferred to ${student.branchName}.`}</Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Student record">
            <div className="mb-5 flex items-center gap-4">
              <StudentPhoto
                studentId={student.id}
                name={fullName}
                hasPhoto={student.hasPhoto}
                version={student.photoVersion.toISOString()}
                size={88}
              />
              <div>
                <p className="text-base font-semibold">{fullName}</p>
                <p className="text-muted text-sm">
                  {student.className
                    ? `${student.className} ${student.sectionName}`
                    : "Not placed in a class"}
                </p>
              </div>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted text-xs">{label}</dt>
                  <dd className="mt-0.5 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            {!student.sensitiveVisible && (
              <p className="text-muted mt-4 text-xs">
                Address, medical notes, and guardian contact details are visible only to authorised
                staff.
              </p>
            )}
          </Card>

          <Card title="Guardians">
            <ul className="divide-border -my-2 divide-y">
              {student.guardians.map((guardian) => (
                <li key={guardian.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {guardian.fullName}
                      {guardian.isPrimary && (
                        <span className="ml-2">
                          <Badge>Primary</Badge>
                        </span>
                      )}
                    </p>
                    <p className="text-muted text-xs">{guardian.relationship}</p>
                  </div>
                  {student.sensitiveVisible && (
                    <p className="text-muted text-right text-xs">
                      {guardian.phone ?? "No phone"}
                      <br />
                      {guardian.email ?? "No email"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Transfer history" description="Moves between branches, newest first.">
            {student.transfers.length === 0 ? (
              <p className="text-muted text-sm">No transfers.</p>
            ) : (
              <ol className="divide-border -my-2 divide-y">
                {student.transfers.map((transfer) => (
                  <li key={transfer.id} className="py-3 text-sm">
                    <p className="font-medium">
                      {transfer.fromBranchName ?? "Another branch"} →{" "}
                      {transfer.toBranchName ?? "Another branch"}
                    </p>
                    <p className="text-muted text-xs">
                      From {formatDate(transfer.effectiveOn)}
                      {transfer.actorName ? ` · by ${transfer.actorName}` : ""}
                      {transfer.reason ? ` · ${transfer.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {canUpdate && (
            <Card title="Edit student details">
              <EditStudentForm
                studentId={student.id}
                values={student}
                sensitive={student.sensitiveVisible}
              />
            </Card>
          )}
        </div>

        {(canUpdate || canTransfer) && (
          <div className="flex flex-col gap-6">
            {canUpdate && (
              <Card title="Photo">
                <StudentPhotoForm studentId={student.id} hasPhoto={student.hasPhoto} />
              </Card>
            )}
            {canUpdate && (
              <Card title="Class placement">
                <PlacementForm
                  studentId={student.id}
                  sectionId={student.sectionId}
                  options={placementOptions.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                />
              </Card>
            )}
            {canUpdate && (
              <Card title="Status">
                <StatusForm studentId={student.id} status={student.status} />
              </Card>
            )}
            {canUpdate && (
              <Card title="Add a guardian">
                <GuardianForm studentId={student.id} sensitive={student.sensitiveVisible} />
              </Card>
            )}
            {canTransfer && transferTargets.length > 0 && (
              <Card title="Transfer to another branch">
                <TransferForm
                  studentId={student.id}
                  branches={transferTargets.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  }))}
                  today={new Date().toISOString().slice(0, 10)}
                />
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
