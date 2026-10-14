import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { logoutAction } from "@/app/(auth)/actions";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme";
import { Avatar } from "@/components/ui";
import { listSelectableBranches } from "@/server/access/branch-filter";
import {
  getRequestAccess,
  getRequestBranch,
  getRequestSchool,
  requireSession,
} from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { users } from "@/server/db/schema";

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
  "hover:bg-surface-muted flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm";

async function Shell({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const db = getDatabase();
  const [access, school, branch, [me]] = await Promise.all([
    getRequestAccess(),
    getRequestSchool(),
    getRequestBranch(),
    db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, session.userId)),
  ]);
  if (!access) redirect("/login");
  const branches = await listSelectableBranches(db, access);
  const groups = buildNavigation(access.permissions);
  const allLabel = access.scope.kind === "school" ? "All branches" : "All my branches";

  const topBar = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {branches.length > 0 && (
          <MenuButton
            label={`Branch: ${branch?.name ?? allLabel}. Change branch`}
            summary={
              <>
                <span className="bg-accent-soft text-accent grid size-7 place-items-center rounded-lg">
                  <Icon name="map-pin" />
                </span>
                <span className="max-w-36 truncate font-medium sm:max-w-60">
                  {branch?.name ?? allLabel}
                </span>
              </>
            }
          >
            <p className="text-muted px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
              Show data for
            </p>
            <form action={switchBranchAction}>
              <input type="hidden" name="branchId" value="" />
              <button type="submit" className={menuItem} aria-current={!branch || undefined}>
                <span className="font-medium">{allLabel}</span>
                {!branch && <span className="text-primary text-xs font-semibold">Current</span>}
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
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className="text-muted block text-xs">
                      {b.area ? `${b.area} · ${b.code}` : b.code}
                    </span>
                  </span>
                  {b.id === branch?.id && (
                    <span className="text-primary text-xs font-semibold">Current</span>
                  )}
                </button>
              </form>
            ))}
          </MenuButton>
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
              size={30}
            />
            <span className="hidden max-w-40 truncate font-medium lg:inline">
              {session.displayName}
            </span>
          </>
        }
      >
        <div className="border-border mb-1 flex items-center gap-3 border-b px-3 pt-2 pb-3">
          <Avatar
            userId={session.userId}
            name={session.displayName}
            hasPhoto={!!me?.avatarKey}
            size={36}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{session.displayName}</p>
            <p className="text-muted truncate text-xs">{session.email}</p>
          </div>
        </div>
        <a href="/dashboard/profile" className={menuItem}>
          <span className="flex items-center gap-2">
            <Icon name="user" /> My profile
          </span>
        </a>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-muted text-sm">Theme</span>
          <ThemeToggle compact />
        </div>
        <form action={logoutAction} className="border-border mt-1 border-t pt-1">
          <button type="submit" className={menuItem}>
            <span className="flex items-center gap-2">
              <Icon name="logout" /> Sign out
            </span>
          </button>
        </form>
      </MenuButton>
    </>
  );

  return (
    <AppShell groups={groups} schoolName={school.name} topBar={topBar}>
      {children}
    </AppShell>
  );
}
