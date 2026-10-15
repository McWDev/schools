import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";

import { NewBranchForm } from "../branch-forms";

export const metadata: Metadata = { title: "Open branch · School Management" };

export default function NewBranchPage() {
  return (
    <>
      <PageHeader
        title="Open a branch"
        description="Add a campus in a new area. You can assign staff to it afterwards."
        backHref="/dashboard/branches"
        backLabel="Branches"
      />
      <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
        <NewBranchContent />
      </Suspense>
    </>
  );
}

async function NewBranchContent() {
  const { access } = await requireAccess();
  if (!hasPermission(access, "branches.manage") || access.scope.kind !== "school") {
    return <NoAccess message="Only school-wide administrators can open branches." />;
  }
  return (
    <Card>
      <NewBranchForm />
    </Card>
  );
}
