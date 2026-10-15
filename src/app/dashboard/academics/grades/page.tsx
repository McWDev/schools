import type { Metadata } from "next";
import { Suspense } from "react";

import { Badge, Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { listGradeLevels } from "@/server/modules/academics/service";

import { GradeForm, StatusButton } from "../academic-forms";

export const metadata: Metadata = { title: "Grade levels · School Management" };

export default function GradeLevelsPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading grade levels…</p>}>
      <GradesContent />
    </Suspense>
  );
}

async function GradesContent() {
  const { access } = await requireAccess();
  if (!hasPermission(access, "academics.read")) return <NoAccess />;
  const grades = await listGradeLevels(getDatabase(), access);
  const canConfigure =
    hasPermission(access, "academics.configure") && access.scope.kind === "school";
  const nextSortOrder = Math.max(0, ...grades.map((grade) => grade.sortOrder)) + 1;

  return (
    <>
      <PageHeader
        title="Grade levels"
        description="The grades the school teaches, shared by every branch."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            {grades.length === 0 ? (
              <p className="text-muted py-6 text-center text-sm">No grade levels yet.</p>
            ) : (
              <div className="-mx-5 -my-5 overflow-x-auto sm:-mx-6 sm:-my-6">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Grade levels</caption>
                  <thead className="text-muted border-border border-b text-xs">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium sm:px-6">
                        Order
                      </th>
                      <th scope="col" className="px-3 py-3 font-medium">
                        Grade
                      </th>
                      <th scope="col" className="px-3 py-3 font-medium">
                        Code
                      </th>
                      <th scope="col" className="px-3 py-3 font-medium">
                        Status
                      </th>
                      {canConfigure && (
                        <th scope="col" className="px-5 py-3 font-medium sm:px-6">
                          <span className="sr-only">Actions</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {grades.map((grade) => (
                      <tr key={grade.id} className="align-top">
                        <td className="text-muted px-5 py-3 tabular-nums sm:px-6">
                          {grade.sortOrder}
                        </td>
                        <td className="px-3 py-3 font-medium">{grade.name}</td>
                        <td className="text-muted px-3 py-3">{grade.code}</td>
                        <td className="px-3 py-3">
                          <Badge tone={grade.status === "active" ? "success" : "neutral"}>
                            {grade.status === "active" ? "Active" : "Archived"}
                          </Badge>
                        </td>
                        {canConfigure && (
                          <td className="px-5 py-2 sm:px-6">
                            <StatusButton
                              kind="grade"
                              id={grade.id}
                              label={grade.name}
                              archived={grade.status === "archived"}
                              explanation="No new classes can use it. Existing classes are kept."
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        {canConfigure && (
          <Card title="Add a grade level">
            <GradeForm nextSortOrder={nextSortOrder} />
          </Card>
        )}
      </div>
    </>
  );
}
