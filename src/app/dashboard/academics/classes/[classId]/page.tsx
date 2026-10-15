import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge, Card, NoAccess, PageHeader } from "@/components/ui";
import { canAccessBranch, hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getClass } from "@/server/modules/academics/service";

import { RenameClassForm, SectionForm, StatusButton } from "../../academic-forms";

export const metadata: Metadata = { title: "Class · School Management" };

export default function ClassPage(props: PageProps<"/dashboard/academics/classes/[classId]">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <ClassContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ClassContent({
  params,
  searchParams,
}: {
  params: PageProps<"/dashboard/academics/classes/[classId]">["params"];
  searchParams: PageProps<"/dashboard/academics/classes/[classId]">["searchParams"];
}) {
  const { access } = await requireAccess();
  if (!hasPermission(access, "academics.read")) return <NoAccess />;
  const [{ classId }, query] = await Promise.all([params, searchParams]);
  const item = await getClass(getDatabase(), access, classId);
  // Classes in other branches are indistinguishable from classes that do not exist.
  if (!item) notFound();
  const canManage =
    hasPermission(access, "classes.manage") && canAccessBranch(access, item.branchId);
  const archived = item.status === "archived";

  return (
    <>
      <PageHeader
        title={item.name}
        description={`${item.branchName} · ${item.gradeLevelName} · ${item.academicYearName}`}
        backHref={`/dashboard/academics/classes?year=${item.academicYearId}`}
        backLabel="Classes"
        actions={archived ? <Badge>Archived</Badge> : undefined}
      />
      {query.created === "1" && (
        <p
          role="status"
          className="border-success/30 bg-success-surface text-success rounded-xl border px-4 py-3 text-sm"
        >
          Class created. Add its sections below.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Sections" description="Streams of this class, each with its own room.">
            {item.sections.length === 0 ? (
              <p className="text-muted text-sm">No sections yet.</p>
            ) : (
              <ul className="divide-border -my-2 divide-y">
                {item.sections.map((section) => (
                  <li
                    key={section.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="bg-accent-soft text-accent grid size-9 shrink-0 place-items-center rounded-lg font-semibold">
                        {section.name.slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">
                          Section {section.name}
                          {section.status === "archived" && (
                            <span className="ml-2">
                              <Badge>Archived</Badge>
                            </span>
                          )}
                        </p>
                        <p className="text-muted text-xs">
                          {section.capacity ? `${section.capacity} seats` : "No seat limit"}
                          {" · "}
                          {section.room ?? "Room not set"}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <StatusButton
                        kind="section"
                        id={section.id}
                        label={`Section ${section.name}`}
                        archived={section.status === "archived"}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {canManage && !archived && (
            <Card title="Add a section">
              <SectionForm classId={item.id} />
            </Card>
          )}
        </div>

        {canManage && (
          <div className="flex flex-col gap-6">
            <Card title="Class details">
              <RenameClassForm classId={item.id} name={item.name} />
            </Card>
            <Card
              title={archived ? "Restore class" : "Archive class"}
              description={
                archived
                  ? "Restore this class to use it again."
                  : "Archiving hides the class from new work. Nothing is deleted."
              }
            >
              <StatusButton
                kind="class"
                id={item.id}
                label={item.name}
                archived={archived}
                explanation="Its sections and history are kept, and it can be restored."
              />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
