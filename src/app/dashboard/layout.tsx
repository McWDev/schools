import { eq } from "drizzle-orm";
import { Suspense } from "react";

import { logoutAction, switchSchoolAction } from "@/app/(auth)/actions";
import { Avatar } from "@/components/ui";
import {
  getCurrentUserSchools,
  getRequestBranch,
  getRequestTenantContext,
  requireSession,
} from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { listSelectableBranches } from "@/server/tenancy/branch-filter";

import { AppShell, MenuButton } from "./app-shell";
import { buildNavigation } from "./navigation";
import { switchBranchAction } from "./shell-actions";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex flex-1" aria-busy="true">
      <div className="border-border bg-surface hidden w-64 border-r md:block" />
      <div className="flex flex-1 flex-col">
        <div className="border-border bg-surface h-14 border-b" />
        <p className="text-muted p-6 text-sm">Loading…</p>
      </div>
    </div>
  );
}

const menuItem =
  "hover:bg-surface-muted flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm";

async function Shell({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const db = getDatabase();
  const [schools, context, branch, [me]] = await Promise.all([
    getCurrentUserSchools(),
    getRequestTenantContext(),
    getRequestBranch(),
    db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, session.userId)),
  ]);
  const branches = context ? await listSelectableBranches(db, context) : [];
  const school = schools.find((s) => s.schoolId === context?.schoolId);
  const groups = buildNavigation({
    permissions: context?.permissions ?? [],
    hasSchool: !!context,
    isPlatformAdmin: session.isPlatformAdmin,
  });

  const topBar = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {school &&
          (schools.length > 1 ? (
            <MenuButton
              label={`School: ${school.name}. Change school`}
              summary={
                <span className="max-w-40 truncate font-medium sm:max-w-64">{school.name}</span>
              }
            >
              <p className="text-muted px-3 pt-2 pb-1 text-xs font-semibold uppercase">
                Switch school
              </p>
              {schools.map((s) => (
                <form key={s.schoolId} action={switchSchoolAction}>
                  <input type="hidden" name="schoolId" value={s.schoolId} />
                  <button
                    type="submit"
                    className={menuItem}
                    aria-current={s.schoolId === school.schoolId || undefined}
                  >
                    {s.name}
                    {s.schoolId === school.schoolId && (
                      <span className="text-muted text-xs">Current</span>
                    )}
                  </button>
                </form>
              ))}
            </MenuButton>
          ) : (
            <span className="max-w-40 truncate px-2 text-sm font-medium sm:max-w-64">
              {school.name}
            </span>
          ))}

        {context && branches.length > 0 && (
          <>
            <span aria-hidden="true" className="text-muted">
              /
            </span>
            <MenuButton
              label={`Branch: ${branch?.name ?? "All branches"}. Change branch`}
              summary={
                <span className="text-muted max-w-32 truncate sm:max-w-56">
                  {branch?.name ??
                    (context.scope.kind === "school" ? "All branches" : "All my branches")}
                </span>
              }
            >
              <p className="text-muted px-3 pt-2 pb-1 text-xs font-semibold uppercase">
                Show data for
              </p>
              <form action={switchBranchAction}>
                <input type="hidden" name="branchId" value="" />
                <button type="submit" className={menuItem} aria-current={!branch || undefined}>
                  {context.scope.kind === "school" ? "All branches" : "All my branches"}
                  {!branch && <span className="text-muted text-xs">Current</span>}
                </button>
              </form>
              {branches.map((b) => (
                <form key={b.id} action={switchBranchAction}>
                  <input type="hidden" name="branchId" value={b.id} />
                  <button
                    type="submit"
                    className={menuItem}
                    aria-current={b.id === branch?.id || undefined}
                  >
                    <span>
                      {b.name} <span className="text-muted text-xs">{b.code}</span>
                    </span>
                    {b.id === branch?.id && <span className="text-muted text-xs">Current</span>}
                  </button>
                </form>
              ))}
            </MenuButton>
          </>
        )}
      </div>

      <MenuButton
        label="Account menu"
        align="end"
        summary={
          <>
            <Avatar
              userId={session.userId}
              name={session.displayName}
              hasPhoto={!!me?.avatarKey}
              size={28}
            />
            <span className="hidden max-w-40 truncate font-medium lg:inline">
              {session.displayName}
            </span>
          </>
        }
      >
        <div className="border-border border-b px-3 py-2">
          <p className="truncate text-sm font-medium">{session.displayName}</p>
          <p className="text-muted truncate text-xs">{session.email}</p>
        </div>
        <a href="/dashboard/profile" className={menuItem}>
          My profile
        </a>
        <form action={logoutAction}>
          <button type="submit" className={menuItem}>
            Sign out
          </button>
        </form>
      </MenuButton>
    </>
  );

  return (
    <AppShell groups={groups} topBar={topBar}>
      {children}
    </AppShell>
  );
}
