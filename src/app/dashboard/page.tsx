import type { Metadata } from "next";
import { Suspense } from "react";

import { logoutAction, switchSchoolAction } from "@/app/(auth)/actions";
import {
  getCurrentUserSchools,
  getRequestTenantContext,
  requireSession,
} from "@/server/auth/request";

export const metadata: Metadata = { title: "Dashboard · School Management" };

// Placeholder protected page for Task 002. The full dashboard shell arrives in Task 004.
export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-muted text-sm">Loading your account…</p>}>
        <AccountSummary />
      </Suspense>
    </main>
  );
}

async function AccountSummary() {
  const session = await requireSession();
  const [schools, context] = await Promise.all([
    getCurrentUserSchools(),
    getRequestTenantContext(),
  ]);
  const active = schools.find((school) => school.schoolId === context?.schoolId);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">Welcome, {session.displayName}</h1>
          <p className="text-muted mt-1 text-sm">
            {active ? `Current school: ${active.name}` : "No school selected"}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="border-border bg-surface hover:bg-surface-muted h-9 rounded-md border px-3 text-sm font-medium"
          >
            Sign out
          </button>
        </form>
      </header>

      <section
        aria-labelledby="schools-heading"
        className="border-border bg-surface rounded-xl border p-6"
      >
        <h2 id="schools-heading" className="text-base font-semibold">
          Your schools
        </h2>
        {schools.length === 0 ? (
          <p className="text-muted mt-2 text-sm">
            Your account is not linked to an active school yet. Contact your school administrator.
          </p>
        ) : (
          <ul className="divide-border mt-3 divide-y">
            {schools.map((school) => (
              <li key={school.schoolId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">{school.name}</p>
                  <p className="text-muted text-xs">
                    {school.scope === "school" ? "All branches" : "Assigned branches only"}
                  </p>
                </div>
                {school.schoolId === context?.schoolId ? (
                  <span className="text-success text-xs font-semibold">Current</span>
                ) : (
                  <form action={switchSchoolAction}>
                    <input type="hidden" name="schoolId" value={school.schoolId} />
                    <button
                      type="submit"
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Switch to this school
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
