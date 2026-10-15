import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { Badge, Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getBranch, listBranchStaff } from "@/server/modules/branches/service";

import { BranchStatusForm, EditBranchForm } from "../branch-forms";

export const metadata: Metadata = { title: "Branch · School Management" };

export default function BranchPage(props: PageProps<"/dashboard/branches/[branchId]">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <BranchContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function BranchContent({
  params,
  searchParams,
}: {
  params: PageProps<"/dashboard/branches/[branchId]">["params"];
  searchParams: PageProps<"/dashboard/branches/[branchId]">["searchParams"];
}) {
  const { access } = await requireAccess();
  if (!hasPermission(access, "branches.read")) return <NoAccess />;
  const [{ branchId }, query] = await Promise.all([params, searchParams]);
  const db = getDatabase();
  const branch = await getBranch(db, access, branchId);
  // Out-of-scope branches are indistinguishable from branches that do not exist.
  if (!branch) notFound();
  const staff = await listBranchStaff(db, access, branch.id);
  const canManage = hasPermission(access, "branches.manage") && access.scope.kind === "school";
  const canSeeStaff = hasPermission(access, "users.read");

  const details: [string, string | null][] = [
    ["Area", branch.area],
    ["Address", branch.address],
    ["Phone", branch.phone],
    ["Email", branch.email],
  ];

  return (
    <>
      <PageHeader
        title={branch.name}
        description={`${branch.area ?? "Area not set"} · ${branch.code}`}
        backHref="/dashboard/branches"
        backLabel="Branches"
        actions={
          <Badge tone={branch.status === "active" ? "success" : "neutral"}>
            {branch.status === "active" ? "Active" : "Inactive"}
          </Badge>
        }
      />
      {query.created === "1" && (
        <p
          role="status"
          className="border-success/30 bg-success-surface text-success rounded-xl border px-4 py-3 text-sm"
        >
          Branch opened. Assign staff to it from Users.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {canManage ? (
            <Card title="Branch details">
              <EditBranchForm branchId={branch.id} values={branch} />
            </Card>
          ) : (
            <Card title="Branch details">
              <dl className="grid gap-4 sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted text-xs">{label}</dt>
                    <dd className="mt-0.5 text-sm">{value ?? "Not set"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          {canManage && (
            <Card
              title={branch.status === "active" ? "Deactivate branch" : "Reopen branch"}
              description={
                branch.status === "active"
                  ? "Closing a branch never deletes its records or history."
                  : "This branch is inactive. Reopen it to use it again."
              }
            >
              <BranchStatusForm
                branchId={branch.id}
                name={branch.name}
                active={branch.status === "active"}
              />
            </Card>
          )}
        </div>

        {canSeeStaff && (
          <Card title="Assigned staff" description="People who work at this branch.">
            {staff.length === 0 ? (
              <p className="text-muted text-sm">No staff assigned yet.</p>
            ) : (
              <ul className="divide-border -my-2 divide-y">
                {staff.map((person) => (
                  <li key={person.userId}>
                    <Link
                      href={`/dashboard/users/${person.userId}`}
                      className="hover:text-primary flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{person.displayName}</span>
                        <span className="text-muted block truncate text-xs">{person.email}</span>
                      </span>
                      <Icon name="chevron" className="text-subtle size-4 -rotate-90" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted mt-4 text-xs">
              School-wide staff can work in every branch and are not listed here.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
