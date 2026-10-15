import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { Badge, buttonClass, Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { listBranchSummaries } from "@/server/modules/branches/service";

export const metadata: Metadata = { title: "Branches · School Management" };

export default function BranchesPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading branches…</p>}>
      <BranchesContent />
    </Suspense>
  );
}

async function BranchesContent() {
  const { access } = await requireAccess();
  if (!hasPermission(access, "branches.read")) return <NoAccess />;
  const branches = await listBranchSummaries(getDatabase(), access);
  const canManage = hasPermission(access, "branches.manage") && access.scope.kind === "school";

  return (
    <>
      <PageHeader
        title="Branches"
        description={
          access.scope.kind === "school"
            ? "Every campus of the school and the area it serves."
            : "The branches you are assigned to."
        }
        actions={
          canManage && (
            <Link href="/dashboard/branches/new" className={buttonClass("primary")}>
              <Icon name="map-pin" />
              Open branch
            </Link>
          )
        }
      />

      {branches.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="bg-accent-soft text-accent grid size-12 place-items-center rounded-full">
              <Icon name="map-pin" className="size-6" />
            </span>
            <p className="font-medium">No branches yet</p>
            <p className="text-muted max-w-sm text-sm">
              {canManage
                ? "Open your first branch to start assigning staff and, later, students."
                : "You are not assigned to a branch yet. Ask a school administrator."}
            </p>
          </div>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branches.map((branch) => (
            <li key={branch.id}>
              <Link
                href={`/dashboard/branches/${branch.id}`}
                className={`border-border bg-surface shadow-card hover:border-primary/50 flex h-full flex-col gap-4 rounded-2xl border p-5 transition-colors ${
                  branch.status === "inactive" ? "opacity-75" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="bg-accent-soft text-accent grid size-10 shrink-0 place-items-center rounded-xl">
                    <Icon name="map-pin" className="size-5" />
                  </span>
                  <Badge tone={branch.status === "active" ? "success" : "neutral"}>
                    {branch.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{branch.name}</p>
                  <p className="text-muted mt-0.5 truncate text-sm">
                    {branch.area ?? "Area not set"} · {branch.code}
                  </p>
                </div>
                <p className="text-muted mt-auto flex items-center gap-2 text-sm">
                  <Icon name="users" />
                  {branch.assignedStaff} assigned staff
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
