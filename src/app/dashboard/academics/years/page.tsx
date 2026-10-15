import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { Badge, buttonClass, Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { listAcademicYears } from "@/server/modules/academics/service";

import { formatRange } from "../format";

export const metadata: Metadata = { title: "Academic years · School Management" };

export default function AcademicYearsPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading academic years…</p>}>
      <YearsContent />
    </Suspense>
  );
}

async function YearsContent() {
  const { access } = await requireAccess();
  if (!hasPermission(access, "academics.read")) return <NoAccess />;
  const years = await listAcademicYears(getDatabase(), access);
  const canConfigure =
    hasPermission(access, "academics.configure") && access.scope.kind === "school";

  return (
    <>
      <PageHeader
        title="Academic years"
        description="School years and their terms. These apply to every branch."
        actions={
          canConfigure && (
            <Link href="/dashboard/academics/years/new" className={buttonClass("primary")}>
              <Icon name="plus" />
              New academic year
            </Link>
          )
        }
      />

      {years.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="bg-accent-soft text-accent grid size-12 place-items-center rounded-full">
              <Icon name="calendar" className="size-6" />
            </span>
            <p className="font-medium">No academic years yet</p>
            <p className="text-muted max-w-sm text-sm">
              {canConfigure
                ? "Create the current school year and its terms to start organising classes."
                : "A school administrator has not set up the academic calendar yet."}
            </p>
          </div>
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {years.map((year) => {
            const activeTerms = year.terms.filter((term) => term.status === "active");
            return (
              <li key={year.id}>
                <Link
                  href={`/dashboard/academics/years/${year.id}`}
                  className={`border-border bg-surface shadow-card hover:border-primary/50 flex h-full flex-col gap-4 rounded-2xl border p-5 transition-colors ${
                    year.status === "archived" ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="bg-accent-soft text-accent grid size-10 shrink-0 place-items-center rounded-xl">
                        <Icon name="calendar" className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{year.name}</p>
                        <p className="text-muted truncate text-sm">
                          {formatRange(year.startsOn, year.endsOn)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {year.isCurrent && <Badge tone="success">Current</Badge>}
                      {year.status === "archived" && <Badge>Archived</Badge>}
                    </div>
                  </div>
                  {activeTerms.length === 0 ? (
                    <p className="text-muted text-sm">No terms yet.</p>
                  ) : (
                    <ol className="flex flex-wrap gap-2">
                      {activeTerms.map((term) => (
                        <li
                          key={term.id}
                          className="border-border bg-surface-muted rounded-lg border px-2.5 py-1 text-xs"
                        >
                          <span className="font-medium">{term.name}</span>
                          <span className="text-muted">
                            {" "}
                            · {formatRange(term.startsOn, term.endsOn)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
