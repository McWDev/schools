import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { buttonClass, Card, StatCard } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { getRequestBranch, getRequestSchool, requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { describeAction, getDashboardSummary } from "@/server/modules/dashboard/service";

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
      <div className="bg-surface-muted h-36 animate-pulse rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-border bg-surface h-32 animate-pulse rounded-2xl border" />
        ))}
      </div>
    </div>
  );
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

async function DashboardContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  const { session, access } = await requireAccess();
  const [school, branch, params] = await Promise.all([
    getRequestSchool(),
    getRequestBranch(),
    searchParams,
  ]);
  const summary = await getDashboardSummary(getDatabase(), access, branch?.id ?? null);
  const scopeLabel = branch
    ? branch.name
    : access.scope.kind === "school"
      ? "All branches"
      : "Your branches";
  const canInvite = hasPermission(access, "users.invite");
  const isNewSchool =
    summary.staff !== undefined && summary.staff.active + summary.staff.pendingInvitations <= 1;
  const branchCount = access.scope.kind === "branch" ? access.scope.branchIds.length : 0;
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: school.timezone })
      .format(now)
      .replace(/\D/g, ""),
  );
  const today = new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: school.timezone,
  }).format(now);
  const timeFormat = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: school.timezone,
  });

  return (
    <>
      <section className="from-hero-from to-hero-to relative overflow-hidden rounded-2xl bg-gradient-to-br px-6 py-7 text-white shadow-lg sm:px-8 sm:py-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-white/10 blur-3xl"
        />
        <p className="relative text-sm font-medium text-white/80">
          {greeting(hour)} · {today}
        </p>
        <h1 className="relative mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome, {session.displayName}
        </h1>
        <p className="relative mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur-sm">
          <Icon name="building" className="size-4" />
          {`${school.name} · ${scopeLabel}`}
        </p>
      </section>

      {params.error === "branch" && (
        <p
          role="alert"
          className="border-danger/30 bg-danger-surface text-danger rounded-xl border px-4 py-3 text-sm"
        >
          That branch is not available to you.
        </p>
      )}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.branches && (
          <StatCard
            label={branch ? "Selected branch" : "Active branches"}
            value={summary.branches.active}
            icon="map-pin"
            tone="accent"
            detail={
              branch
                ? `${branch.name} (${branch.code})`
                : access.scope.kind === "school"
                  ? "Across the school"
                  : "Assigned to you"
            }
          />
        )}
        {summary.staff && (
          <StatCard
            label="Staff with access"
            value={summary.staff.active}
            icon="users"
            tone="primary"
            detail={`${summary.staff.pendingInvitations} invitation${summary.staff.pendingInvitations === 1 ? "" : "s"} pending · ${summary.staff.noAccess} without access`}
            href="/dashboard/users"
          />
        )}
        <StatCard
          label="Your access"
          value={
            <span className="text-lg leading-7 font-semibold">
              {summary.myRoles.join(", ") || "No roles assigned"}
            </span>
          }
          icon="badge"
          tone="success"
          detail={
            access.scope.kind === "school"
              ? "Every branch of the school"
              : `${branchCount} assigned branch${branchCount === 1 ? "" : "es"}`
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {canInvite && (
          <div className="lg:col-span-1">
            <Card title={isNewSchool ? "Get started" : "Quick actions"}>
              {isNewSchool && (
                <p className="text-muted mb-4 text-sm">
                  The system is set up. Invite your staff so they can sign in.
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Link href="/dashboard/users/invite" className={buttonClass("primary")}>
                  <Icon name="user-plus" />
                  Invite staff
                </Link>
                <Link href="/dashboard/users" className={buttonClass("secondary")}>
                  <Icon name="users" />
                  Manage staff
                </Link>
              </div>
            </Card>
          </div>
        )}

        {summary.recentActivity && (
          <div className={canInvite ? "lg:col-span-2" : "lg:col-span-3"}>
            <Card title="Recent activity" description="Latest administrative changes.">
              {summary.recentActivity.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <span className="bg-surface-muted text-muted grid size-10 place-items-center rounded-full">
                    <Icon name="activity" />
                  </span>
                  <p className="text-muted text-sm">No activity yet.</p>
                </div>
              ) : (
                <ol className="relative flex flex-col">
                  {summary.recentActivity.map((event) => (
                    <li key={event.id} className="flex gap-3 py-2.5">
                      <span
                        aria-hidden="true"
                        className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                      />
                      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
                        <span>
                          <span className="font-medium">{event.actorName ?? "System"}</span>{" "}
                          <span className="text-muted">{describeAction(event.action)}</span>
                          {event.outcome !== "success" && (
                            <span className="text-danger"> ({event.outcome})</span>
                          )}
                        </span>
                        <time
                          dateTime={event.occurredAt.toISOString()}
                          className="text-subtle text-xs"
                        >
                          {timeFormat.format(event.occurredAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        )}
      </div>

      {!summary.staff && !canInvite && (
        <Card title="Your work">
          <p className="text-muted text-sm">
            Classes, timetables, and attendance will appear here once they are set up.
          </p>
        </Card>
      )}
    </>
  );
}
