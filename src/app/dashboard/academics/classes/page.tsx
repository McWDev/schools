import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { Badge, buttonClass, Card, NoAccess, PageHeader } from "@/components/ui";
import { listSelectableBranches } from "@/server/access/branch-filter";
import { hasPermission } from "@/server/access/context";
import { getRequestBranch, requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import {
  listAcademicYears,
  listClasses,
  listGradeLevels,
} from "@/server/modules/academics/service";

import { ClassForm } from "../academic-forms";

export const metadata: Metadata = { title: "Classes · School Management" };

export default function ClassesPage(props: PageProps<"/dashboard/academics/classes">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading classes…</p>}>
      <ClassesContent searchParams={props.searchParams} />
    </Suspense>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function ClassesContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard/academics/classes">["searchParams"];
}) {
  const { access } = await requireAccess();
  if (!hasPermission(access, "academics.read")) return <NoAccess />;
  const db = getDatabase();
  const [query, years, grades, branches, activeBranch] = await Promise.all([
    searchParams,
    listAcademicYears(db, access),
    listGradeLevels(db, access),
    listSelectableBranches(db, access),
    getRequestBranch(),
  ]);

  // Default to the current year and the branch picked in the header.
  const current = years.find((year) => year.isCurrent) ?? years[0];
  const yearId = years.some((year) => year.id === single(query.year))
    ? single(query.year)!
    : current?.id;
  const year = years.find((item) => item.id === yearId);
  const classes = year
    ? await listClasses(db, access, { academicYearId: year.id, branchId: activeBranch?.id })
    : [];
  const canManage = hasPermission(access, "classes.manage") && branches.length > 0;
  const activeYears = years.filter((item) => item.status === "active");
  const activeGrades = grades.filter((grade) => grade.status === "active");

  return (
    <>
      <PageHeader
        title="Classes"
        description={
          activeBranch
            ? `Classes and sections at ${activeBranch.name}.`
            : access.scope.kind === "school"
              ? "Classes and sections across every branch."
              : "Classes and sections in your branches."
        }
      />

      {years.length > 1 && (
        <nav aria-label="Academic year" className="flex flex-wrap gap-2">
          {years.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/academics/classes?year=${item.id}`}
              aria-current={item.id === yearId ? "page" : undefined}
              className={buttonClass(item.id === yearId ? "primary" : "secondary", "sm")}
            >
              {item.name}
              {item.isCurrent ? " (current)" : ""}
            </Link>
          ))}
        </nav>
      )}

      {!year ? (
        <Card>
          <p className="text-muted py-6 text-center text-sm">
            Set up an academic year before creating classes.
          </p>
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="bg-accent-soft text-accent grid size-12 place-items-center rounded-full">
              <Icon name="book" className="size-6" />
            </span>
            <p className="font-medium">No classes in {year.name} yet</p>
            <p className="text-muted max-w-sm text-sm">
              {canManage
                ? "Create a class for each grade taught at a branch, then add its sections."
                : "Classes for this year have not been set up yet."}
            </p>
          </div>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((item) => {
            const sections = item.sections.filter((section) => section.status === "active");
            const seats = sections.reduce((sum, section) => sum + (section.capacity ?? 0), 0);
            return (
              <li key={item.id}>
                <Link
                  href={`/dashboard/academics/classes/${item.id}`}
                  className={`border-border bg-surface shadow-card hover:border-primary/50 flex h-full flex-col gap-3 rounded-2xl border p-5 transition-colors ${
                    item.status === "archived" ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{item.name}</p>
                      <p className="text-muted truncate text-sm">
                        {item.branchName} · {item.gradeLevelName}
                      </p>
                    </div>
                    {item.status === "archived" && <Badge>Archived</Badge>}
                  </div>
                  <p className="text-muted mt-auto flex items-center gap-2 text-sm">
                    <Icon name="layers" />
                    {sections.length === 0
                      ? "No sections"
                      : `Sections ${sections.map((section) => section.name).join(", ")}`}
                    {seats > 0 && ` · ${seats} seats`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && activeYears.length > 0 && (
        <Card title="Create a class" description="One class per grade, branch, and year.">
          {activeGrades.length === 0 ? (
            <p className="text-muted text-sm">
              Add grade levels first. A school administrator manages them under Grade levels.
            </p>
          ) : (
            <ClassForm
              branches={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              years={activeYears.map((item) => ({ value: item.id, label: item.name }))}
              grades={activeGrades.map((grade) => ({ value: grade.id, label: grade.name }))}
              defaults={{
                branchId: activeBranch?.id ?? branches[0]?.id,
                academicYearId: year?.status === "active" ? year.id : activeYears[0]?.id,
              }}
            />
          )}
        </Card>
      )}
    </>
  );
}
