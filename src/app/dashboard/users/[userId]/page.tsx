import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Avatar, Badge, Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { hasRecentAuthentication } from "@/server/auth/reauth";
import { requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getInviteOptions, getStaff } from "@/server/modules/users/service";

import { staffStatus } from "../member-status";
import {
  AccessForm,
  DetailsForm,
  ResendInvitationForm,
  RolesForm,
  StatusForm,
} from "./member-forms";

export const metadata: Metadata = { title: "User · School Management" };

export default function StaffPage(props: PageProps<"/dashboard/users/[userId]">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <StaffContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function StaffContent({
  params,
  searchParams,
}: {
  params: PageProps<"/dashboard/users/[userId]">["params"];
  searchParams: PageProps<"/dashboard/users/[userId]">["searchParams"];
}) {
  const { session, access } = await requireAccess();
  if (!hasPermission(access, "users.read")) return <NoAccess />;
  const { userId } = await params;
  const db = getDatabase();
  const member = await getStaff(db, access, userId);
  // Out-of-scope IDs are indistinguishable from IDs that do not exist.
  if (!member) notFound();

  const [options, recentAuth, query] = await Promise.all([
    getInviteOptions(db, access),
    hasRecentAuthentication(db, session.sessionId),
    searchParams,
  ]);
  const status = staffStatus(member);
  const hasNoAccess = member.status === "deactivated" || member.status === "suspended";
  const canAssign = hasPermission(access, "users.assign_roles") && !member.isSelf;
  const canDeactivate = hasPermission(access, "users.deactivate") && !member.isSelf;
  const canUpdate = hasPermission(access, "users.update");
  const canInvite = hasPermission(access, "users.invite") && !member.isSelf;

  return (
    <>
      <PageHeader
        title={member.displayName}
        description={member.email}
        backHref="/dashboard/users"
        backLabel="Users"
      />
      {query.invited === "1" && (
        <p
          role="status"
          className="border-success/30 bg-success-surface text-success rounded-md border px-3 py-2 text-sm"
        >
          Invitation sent. The link expires in 7 days.
        </p>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            userId={member.userId}
            name={member.displayName}
            hasPhoto={member.hasAvatar}
            size={56}
          />
          <dl className="grid flex-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted text-xs">Status</dt>
              <dd className="mt-0.5">
                <Badge tone={status.tone}>{status.label}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Roles</dt>
              <dd className="mt-0.5">{member.roles.map((r) => r.name).join(", ") || "None"}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Branch access</dt>
              <dd className="mt-0.5">
                {member.scope === "school"
                  ? "All branches"
                  : member.branches.map((b) => b.name).join(", ") || "None"}
              </dd>
            </div>
          </dl>
        </div>
        {member.status === "invited" && canInvite && (
          <div className="border-border mt-4 border-t pt-4">
            <ResendInvitationForm userId={member.userId} />
          </div>
        )}
      </Card>

      {member.isSelf && (
        <p className="text-muted text-sm">
          You cannot change your own roles, access, or status. Ask another administrator.
        </p>
      )}

      {canUpdate && (
        <Card title="Details">
          <DetailsForm userId={member.userId} displayName={member.displayName} />
        </Card>
      )}
      {canAssign && (
        <>
          <Card title="Roles" description="Roles decide what this person can do.">
            <RolesForm
              userId={member.userId}
              roles={options.roles}
              selected={member.roles.map((r) => r.id)}
              needsPassword={!recentAuth}
            />
          </Card>
          <Card
            title="Branch access"
            description="Branches whose records this person can work with."
          >
            <AccessForm
              userId={member.userId}
              branches={options.branches}
              canGrantSchoolScope={options.canGrantSchoolScope}
              scope={member.scope}
              selectedBranches={member.branches.map((b) => b.id)}
              needsPassword={!recentAuth}
            />
          </Card>
        </>
      )}
      {canDeactivate && (
        <Card
          title={hasNoAccess ? "Restore access" : "Remove access"}
          description={
            hasNoAccess
              ? "They will be able to sign in and work again."
              : "Their account is deactivated and they are signed out immediately. Their history is kept."
          }
        >
          <StatusForm
            userId={member.userId}
            suspended={hasNoAccess}
            name={member.displayName}
            needsPassword={!recentAuth}
          />
        </Card>
      )}
    </>
  );
}
