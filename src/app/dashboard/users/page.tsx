import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Avatar, Badge, Card, NoAccess, PageHeader } from "@/components/ui";
import { requireTenantRequest } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { listMembers } from "@/server/modules/users/service";
import { hasPermission } from "@/server/tenancy/context";

import { memberStatus } from "./member-status";

export const metadata: Metadata = { title: "Users · School Management" };

export default function UsersPage(props: PageProps<"/dashboard/users">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading users…</p>}>
      <UsersContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function UsersContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard/users">["searchParams"];
}) {
  const { context } = await requireTenantRequest();
  if (!hasPermission(context, "users.read")) return <NoAccess />;

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;
  const { items, total, pageSize } = await listMembers(getDatabase(), context, {
    search,
    page,
    pageSize: 20,
  });
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const href = (p: number) =>
    `/dashboard/users?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Users"
        description={
          context.scope.kind === "school"
            ? "Staff across every branch of your school."
            : "Staff in the branches you manage."
        }
        actions={
          hasPermission(context, "users.invite") && (
            <Link
              href="/dashboard/users/invite"
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold"
            >
              Invite user
            </Link>
          )
        }
      />
      {params.moved === "1" && (
        <p
          role="status"
          className="border-success/30 bg-success-surface text-success rounded-md border px-3 py-2 text-sm"
        >
          Access updated. That person is now outside the branches you manage.
        </p>
      )}

      <Card>
        <form role="search" className="mb-4 flex gap-2" action="/dashboard/users">
          <label htmlFor="user-search" className="sr-only">
            Search by name or email
          </label>
          <input
            id="user-search"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Search by name or email"
            className="border-border bg-surface h-9 w-full max-w-sm rounded-md border px-3 text-sm"
          />
          <button
            type="submit"
            className="border-border hover:bg-surface-muted h-9 rounded-md border px-3 text-sm font-medium"
          >
            Search
          </button>
        </form>

        {items.length === 0 ? (
          <p className="text-muted py-8 text-center text-sm">
            {search
              ? `No users match “${search}”.`
              : "No users yet. Invite your first staff member."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Users, {total} in total</caption>
              <thead className="text-muted border-border border-b text-xs uppercase">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Name
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Roles
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Access
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {items.map((member) => {
                  const status = memberStatus(member);
                  return (
                    <tr key={member.membershipId}>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/users/${member.membershipId}`}
                          className="group flex items-center gap-3"
                        >
                          <Avatar
                            userId={member.userId}
                            name={member.displayName}
                            hasPhoto={member.hasAvatar}
                            size={32}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium group-hover:underline">
                              {member.displayName}
                              {member.isSelf && (
                                <span className="text-muted font-normal"> (you)</span>
                              )}
                            </span>
                            <span className="text-muted block truncate text-xs">
                              {member.email}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        {member.roles.map((r) => r.name).join(", ") || "—"}
                      </td>
                      <td className="py-3 pr-4">
                        {member.scope === "school"
                          ? "All branches"
                          : member.branches.map((b) => b.name).join(", ")}
                      </td>
                      <td className="py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted">
              Page {page} of {pages} · {total} users
            </span>
            <span className="flex gap-2">
              {page > 1 && (
                <Link className="text-primary hover:underline" href={href(page - 1)}>
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link className="text-primary hover:underline" href={href(page + 1)}>
                  Next
                </Link>
              )}
            </span>
          </nav>
        )}
      </Card>
    </>
  );
}
