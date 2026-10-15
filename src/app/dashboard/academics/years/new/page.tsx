import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";

import { YearForm } from "../../academic-forms";

export const metadata: Metadata = { title: "New academic year · School Management" };

export default function NewAcademicYearPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <NewYearContent />
    </Suspense>
  );
}

async function NewYearContent() {
  const { access } = await requireAccess();
  if (!hasPermission(access, "academics.configure") || access.scope.kind !== "school") {
    return <NoAccess />;
  }
  return (
    <>
      <PageHeader
        title="New academic year"
        description="Add the year first, then its terms."
        backHref="/dashboard/academics/years"
        backLabel="Academic years"
      />
      <div className="max-w-2xl">
        <Card>
          <YearForm />
        </Card>
      </div>
    </>
  );
}
