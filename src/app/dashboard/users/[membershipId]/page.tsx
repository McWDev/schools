import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Avatar, Badge, Card, NoAccess, PageHeader } from "@/components/ui";
import { hasRecentAuthentication } from "@/server/auth/reauth";
import { requireTenantRequest } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getInviteOptions, getMember } from "@/server/modules/users/service";
import { hasPermission } from "@/server/tenancy/context";

import { memberStatus } from "../member-status";
import {
  AccessForm,
  DetailsForm,
  ResendInvitationForm,
  RolesForm,
  StatusForm,
} from "./member-forms";

export const metadata: Metadata = { title: "User · School Management" };

export default function MemberPage(props: PageProps<"/dashboard/users/[membershipId]">) {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <MemberContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function MemberContent({
  params,
  searchParams,
}: {
  params: PageProps<"/dashboard/users/[membershipId]">["params"];
  searchParams: PageProps<"/dashboard/users/[membershipId]">["searchParams"];
}) {
  const { session, context } = await requireTenantRequest();
  if (!hasPermission(context, "users.read")) return <NoAccess />;
  const { membershipId } = await params;
  const db = getDatabase();
  const member = await getMember(db, context, membershipId);
  // Out-of-scope and other-school IDs are indistinguishable from IDs that do not exist.
  if (!member) notFound();

  const [options, recentAuth, query] = await Promise.all([
    getInviteOptions(db, context),
    hasRecentAuthentication(db, session.sessionId),
    searchParams,
  ]);
  const status = memberStatus(member);
  const canAssign = hasPermission(context, "users.assign_roles") && !member.isSelf;
  const canDeactivate = hasPermission(context, "users.deactivate") && !member.isSelf;
  const canUpdate = hasPermission(context, "users.update");
  const canInvite = hasPermission(context, "users.invite") && !member.isSelf;

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
          {member.userStatus === "invited"
            ? "Invitation sent. The link expires in 7 days."
            : "Added. They can sign in with their existing account."}
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
                  : member.branches.map((b) => b.name).join(", ")}
              </dd>
            </div>
          </dl>
        </div>
        {member.userStatus === "invited" && canInvite && (
          <div className="border-border mt-4 border-t pt-4">
            <ResendInvitationForm membershipId={member.membershipId} />
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
          <DetailsForm membershipId={member.membershipId} displayName={member.displayName} />
        </Card>
      )}
      {canAssign && (
        <>
          <Card title="Roles" description="Roles decide what this person can do.">
            <RolesForm
              membershipId={member.membershipId}
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
              membershipId={member.membershipId}
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
          title={member.membershipStatus === "suspended" ? "Restore access" : "Remove access"}
          description={
            member.membershipStatus === "suspended"
              ? "They will be able to work in this school again."
              : "They will be signed out of this school immediately. Their history is kept. If this is their only school, their account is deactivated."
          }
        >
          <StatusForm
            membershipId={member.membershipId}
            suspended={member.membershipStatus === "suspended"}
            name={member.displayName}
            needsPassword={!recentAuth}
          />
        </Card>
      )}
    </>
  );
}
