import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Avatar, Badge, buttonClass, Card, NoAccess, PageHeader } from "@/components/ui";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { listStaff } from "@/server/modules/users/service";
import { hasPermission } from "@/server/access/context";

import { staffStatus } from "./member-status";

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
  const { access } = await requireAccess();
  if (!hasPermission(access, "users.read")) return <NoAccess />;

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;
  const { items, total, pageSize } = await listStaff(getDatabase(), access, {
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
          access.scope.kind === "school"
            ? "Staff across every branch."
            : "Staff in the branches you manage."
        }
        actions={
          hasPermission(access, "users.invite") && (
            <Link href="/dashboard/users/invite" className={buttonClass("primary")}>
              Invite user
            </Link>
          )
        }
      />
      {params.moved === "1" && (
        <p
          role="status"
          className="border-success/30 bg-success-surface text-success rounded-xl border px-4 py-3 text-sm"
        >
          Access updated. That person is now outside the branches you manage.
        </p>
      )}

      <Card>
        <form role="search" className="mb-5 flex gap-2" action="/dashboard/users">
          <label htmlFor="user-search" className="sr-only">
            Search by name or email
          </label>
          <input
            id="user-search"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Search by name or email"
            className="border-border bg-surface placeholder:text-subtle focus:border-primary focus:ring-primary/20 h-10 w-full max-w-sm rounded-lg border px-3 text-sm outline-none focus:ring-4"
          />
          <button type="submit" className={buttonClass("secondary")}>
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
          <div className="border-border -mx-5 overflow-x-auto border-y sm:-mx-6">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Users, {total} in total</caption>
              <thead className="bg-surface-muted text-muted border-border border-b text-[11px] tracking-wide uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    Name
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    Roles
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    Access
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border [&>tr:hover]:bg-surface-muted/60 divide-y [&>tr]:transition-colors">
                {items.map((member) => {
                  const status = staffStatus(member);
                  return (
                    <tr key={member.userId}>
                      <td className="px-5 py-3.5 sm:px-6">
                        <Link
                          href={`/dashboard/users/${member.userId}`}
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
                      <td className="px-5 py-3.5 sm:px-6">
                        {member.roles.map((r) => r.name).join(", ") || "—"}
                      </td>
                      <td className="px-5 py-3.5 sm:px-6">
                        {member.scope === "school"
                          ? "All branches"
                          : member.branches.map((b) => b.name).join(", ")}
                      </td>
                      <td className="px-5 py-3.5 sm:px-6">
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
