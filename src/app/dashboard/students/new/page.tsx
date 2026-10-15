import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, NoAccess, PageHeader } from "@/components/ui";
import { listSelectableBranches } from "@/server/access/branch-filter";
import { hasPermission } from "@/server/access/context";
import { getRequestBranch, requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { listPlacementOptions } from "@/server/modules/students/service";

import { AdmissionForm } from "../student-forms";

export const metadata: Metadata = { title: "Admit student · School Management" };

export default function AdmitStudentPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <AdmitContent />
    </Suspense>
  );
}

async function AdmitContent() {
  const { access } = await requireAccess();
  if (!hasPermission(access, "students.create")) return <NoAccess />;
  const db = getDatabase();
  const [branches, activeBranch] = await Promise.all([
    listSelectableBranches(db, access),
    getRequestBranch(),
  ]);
  if (branches.length === 0) {
    return <NoAccess message="You need an active branch before you can admit students." />;
  }
  const sectionsByBranch = await Promise.all(
    branches.map(async (branch) =>
      (await listPlacementOptions(db, access, branch.id)).map((option) => ({
        value: option.id,
        label: branches.length > 1 ? `${branch.name} · ${option.label}` : option.label,
      })),
    ),
  );

  return (
    <>
      <PageHeader
        title="Admit student"
        description="Register a new student and their primary guardian. A student number is issued automatically."
        backHref="/dashboard/students"
        backLabel="Students"
      />
      <div className="max-w-3xl">
        <Card>
          <AdmissionForm
            branches={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            sections={sectionsByBranch.flat()}
            defaults={{
              branchId: activeBranch?.id ?? branches[0].id,
              admissionDate: new Date().toISOString().slice(0, 10),
            }}
            sensitive={hasPermission(access, "students.read_sensitive")}
          />
        </Card>
      </div>
    </>
  );
}
