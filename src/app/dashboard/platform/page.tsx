import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, NoAccess, PageHeader } from "@/components/ui";
import { requireSession } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getPlatformOverview } from "@/server/modules/dashboard/service";

export const metadata: Metadata = { title: "Platform overview · School Management" };

export default function PlatformPage() {
  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Aggregate figures only. School records stay private to each school."
      />
      <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
        <PlatformContent />
      </Suspense>
    </>
  );
}

async function PlatformContent() {
  const session = await requireSession();
  const overview = await getPlatformOverview(getDatabase(), session);
  if (!overview) return <NoAccess message="This page is for platform administrators." />;
  const rows = ["active", "pending", "suspended", "closed"] as const;
  return (
    <Card title="Schools by status">
      <dl className="grid gap-4 sm:grid-cols-4">
        {rows.map((status) => (
          <div key={status} className="border-border rounded-lg border p-4">
            <dt className="text-muted text-sm capitalize">{status}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {overview.byStatus[status] ?? 0}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted mt-4 text-sm">
        School onboarding and plan management arrive in later releases.
      </p>
    </Card>
  );
}
