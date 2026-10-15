import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge, Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { listAcademicYears } from "@/server/modules/academics/service";

import { MakeCurrentButton, StatusButton, TermForm, YearForm } from "../../academic-forms";
import { formatRange } from "../../format";

export const metadata: Metadata = { title: "Academic year · School Management" };

export default function AcademicYearPage(props: PageProps<"/dashboard/academics/years/[yearId]">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <YearContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function YearContent({
  params,
  searchParams,
}: {
  params: PageProps<"/dashboard/academics/years/[yearId]">["params"];
  searchParams: PageProps<"/dashboard/academics/years/[yearId]">["searchParams"];
}) {
  const { access } = await requireAccess();
  if (!hasPermission(access, "academics.read")) return <NoAccess />;
  const [{ yearId }, query] = await Promise.all([params, searchParams]);
  const years = await listAcademicYears(getDatabase(), access);
  const year = years.find((item) => item.id === yearId);
  if (!year) notFound();
  const canConfigure =
    hasPermission(access, "academics.configure") && access.scope.kind === "school";
  const archived = year.status === "archived";
  const nextSequence = Math.max(0, ...year.terms.map((term) => term.sequence)) + 1;

  return (
    <>
      <PageHeader
        title={year.name}
        description={formatRange(year.startsOn, year.endsOn)}
        backHref="/dashboard/academics/years"
        backLabel="Academic years"
        actions={
          <div className="flex gap-1.5">
            {year.isCurrent && <Badge tone="success">Current year</Badge>}
            {archived && <Badge>Archived</Badge>}
          </div>
        }
      />
      {query.created === "1" && (
        <p
          role="status"
          className="border-success/30 bg-success-surface text-success rounded-xl border px-4 py-3 text-sm"
        >
          Academic year created. Add its terms below.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Terms" description="Terms or semesters, in order.">
            {year.terms.length === 0 ? (
              <p className="text-muted text-sm">No terms yet.</p>
            ) : (
              <ol className="divide-border -my-2 divide-y">
                {year.terms.map((term) => (
                  <li
                    key={term.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="bg-surface-muted text-muted grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold">
                        {term.sequence}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">
                          {term.name}
                          {term.status === "archived" && (
                            <span className="ml-2">
                              <Badge>Archived</Badge>
                            </span>
                          )}
                        </p>
                        <p className="text-muted text-xs">
                          {formatRange(term.startsOn, term.endsOn)}
                        </p>
                      </div>
                    </div>
                    {canConfigure && (
                      <StatusButton
                        kind="term"
                        id={term.id}
                        label={term.name}
                        archived={term.status === "archived"}
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          {canConfigure && !archived && (
            <Card title="Add a term" description="Term dates must fall within the year.">
              <TermForm yearId={year.id} nextSequence={nextSequence} />
            </Card>
          )}
        </div>

        {canConfigure && (
          <div className="flex flex-col gap-6">
            <Card title="Year details">
              <YearForm year={year} />
            </Card>
            {!year.isCurrent && !archived && (
              <Card
                title="Current year"
                description="New classes and daily work default to the current year."
              >
                <MakeCurrentButton yearId={year.id} />
              </Card>
            )}
            {!year.isCurrent && (
              <Card
                title={archived ? "Restore year" : "Archive year"}
                description={
                  archived
                    ? "Restore this year to use it again."
                    : "Archiving hides the year from new work. Nothing is deleted."
                }
              >
                <StatusButton
                  kind="year"
                  id={year.id}
                  label={year.name}
                  archived={archived}
                  explanation="Its terms, classes, and history are kept, and it can be restored."
                />
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
