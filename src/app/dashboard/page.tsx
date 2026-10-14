import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { switchSchoolAction } from "@/app/(auth)/actions";
import { Card, PageHeader } from "@/components/ui";
import {
  getCurrentUserSchools,
  getRequestBranch,
  getRequestTenantContext,
  requireSession,
} from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import {
  describeAction,
  getDashboardSummary,
  getPlatformOverview,
} from "@/server/modules/dashboard/service";
import { hasPermission } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Dashboard · School Management" };

export default function DashboardPage(props: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent searchParams={props.searchParams} />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="flex flex-col gap-6">
      <div className="bg-surface-muted h-8 w-64 animate-pulse rounded-md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-border bg-surface h-28 animate-pulse rounded-xl border" />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: number;
  detail?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-muted text-sm">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="text-muted mt-1 text-xs">{detail}</p>}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="border-border bg-surface hover:border-primary/40 rounded-xl border p-5"
    >
      {body}
    </Link>
  ) : (
    <div className="border-border bg-surface rounded-xl border p-5">{body}</div>
  );
}

const timeFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

async function DashboardContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  const session = await requireSession();
  const db = getDatabase();
  const [context, schools, branch, params, platform] = await Promise.all([
    getRequestTenantContext(),
    getCurrentUserSchools(),
    getRequestBranch(),
    searchParams,
    getPlatformOverview(db, session),
  ]);
  const school = schools.find((s) => s.schoolId === context?.schoolId);
  const scopeLabel = branch
    ? branch.name
    : context?.scope.kind === "school"
      ? "All branches"
      : "Your branches";
  const notice =
    params.error === "branch"
      ? "That branch is not available to you."
      : params.error === "school"
        ? "That school is not available to you."
        : null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${session.displayName}`}
        description={
          school ? `Current school: ${school.name} · ${scopeLabel}` : "No school selected"
        }
      />
      {notice && (
        <p
          role="alert"
          className="border-danger/30 bg-danger-surface text-danger rounded-md border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      )}

      {platform && (
        <Card
          title="Platform"
          description="Schools hosted on the platform. School records stay private to each school."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Schools" value={platform.total} href="/dashboard/platform" />
            <StatCard label="Active" value={platform.byStatus.active ?? 0} />
            <StatCard
              label="Pending or suspended"
              value={(platform.byStatus.pending ?? 0) + (platform.byStatus.suspended ?? 0)}
            />
          </div>
        </Card>
      )}

      {!context && <SchoolPicker schools={schools} isPlatformAdmin={session.isPlatformAdmin} />}

      {context && <SchoolDashboard />}
    </>
  );
}

function SchoolPicker({
  schools,
  isPlatformAdmin,
}: {
  schools: Awaited<ReturnType<typeof getCurrentUserSchools>>;
  isPlatformAdmin: boolean;
}) {
  if (schools.length === 0) {
    return isPlatformAdmin ? null : (
      <Card title="No school yet">
        <p className="text-muted text-sm">
          Your account is not linked to an active school yet. Contact your school administrator.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Your schools" description="Choose the school you want to work in.">
      <ul className="divide-border divide-y">
        {schools.map((school) => (
          <li key={school.schoolId} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium">{school.name}</p>
              <p className="text-muted text-xs">
                {school.scope === "school" ? "All branches" : "Assigned branches only"}
              </p>
            </div>
            <form action={switchSchoolAction}>
              <input type="hidden" name="schoolId" value={school.schoolId} />
              <button type="submit" className="text-primary text-sm font-medium hover:underline">
                Switch to this school
              </button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function SchoolDashboard() {
  const context = (await getRequestTenantContext())!;
  const branch = await getRequestBranch();
  const summary = await getDashboardSummary(getDatabase(), context, branch?.id ?? null);
  const canInvite = hasPermission(context, "users.invite");
  const isNewSchool =
    summary.staff !== undefined && summary.staff.active + summary.staff.pendingInvitations <= 1;
  const branchCount = context.scope.kind === "branch" ? context.scope.branchIds.length : 0;

  return (
    <>
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.branches && (
          <StatCard
            label={branch ? "Selected branch" : "Active branches"}
            value={summary.branches.active}
            detail={
              branch
                ? `${branch.name} (${branch.code})`
                : context.scope.kind === "school"
                  ? "Across the school"
                  : "Assigned to you"
            }
          />
        )}
        {summary.staff && (
          <StatCard
            label="Staff with access"
            value={summary.staff.active}
            detail={`${summary.staff.pendingInvitations} invitation${summary.staff.pendingInvitations === 1 ? "" : "s"} pending · ${summary.staff.noAccess} without access`}
            href="/dashboard/users"
          />
        )}
        <div className="border-border bg-surface rounded-xl border p-5">
          <p className="text-muted text-sm">Your access</p>
          <p className="mt-1 font-semibold">{summary.myRoles.join(", ") || "No roles assigned"}</p>
          <p className="text-muted mt-1 text-xs">
            {context.scope.kind === "school"
              ? "Every branch of this school"
              : `${branchCount} assigned branch${branchCount === 1 ? "" : "es"}`}
          </p>
        </div>
      </section>

      {canInvite && (
        <Card title={isNewSchool ? "Get started" : "Quick actions"}>
          {isNewSchool && (
            <p className="text-muted mb-3 text-sm">
              Your school is set up. Invite your staff so they can sign in.
            </p>
          )}
          <Link
            href="/dashboard/users/invite"
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold"
          >
            Invite staff
          </Link>
        </Card>
      )}

      {summary.recentActivity && (
        <Card title="Recent activity" description="Latest administrative changes in this school.">
          {summary.recentActivity.length === 0 ? (
            <p className="text-muted text-sm">No activity yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {summary.recentActivity.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm"
                >
                  <span>
                    <span className="font-medium">{event.actorName ?? "System"}</span>{" "}
                    {describeAction(event.action)}
                    {event.outcome !== "success" && (
                      <span className="text-danger"> ({event.outcome})</span>
                    )}
                  </span>
                  <time dateTime={event.occurredAt.toISOString()} className="text-muted text-xs">
                    {timeFormat.format(event.occurredAt)} UTC
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!summary.staff && !canInvite && (
        <Card title="Your work">
          <p className="text-muted text-sm">
            Classes, timetables, and attendance will appear here once your school sets them up.
          </p>
        </Card>
      )}
    </>
  );
}
