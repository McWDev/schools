import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, NoAccess, PageHeader } from "@/components/ui";
import { requireTenantRequest } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getInviteOptions } from "@/server/modules/users/service";
import { hasPermission } from "@/server/tenancy/context";

import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Invite user · School Management" };

export default function InvitePage() {
  return (
    <>
      <PageHeader
        title="Invite user"
        description="They will receive an email link to set their password."
        backHref="/dashboard/users"
        backLabel="Users"
      />
      <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
        <InviteContent />
      </Suspense>
    </>
  );
}

async function InviteContent() {
  const { context } = await requireTenantRequest();
  if (!hasPermission(context, "users.invite")) return <NoAccess />;
  const options = await getInviteOptions(getDatabase(), context);
  return (
    <Card>
      <InviteForm {...options} />
    </Card>
  );
}
