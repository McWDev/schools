import Link from "next/link";
import { Suspense } from "react";

import { logoutAction } from "@/app/(auth)/actions";
import { getRequestTenantContext, requireSession } from "@/server/auth/request";
import { hasPermission } from "@/server/tenancy/context";

// Interim navigation for Task 003. The full application shell is built in Task 004.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/dashboard" className="text-sm font-semibold">
            School Management
          </Link>
          <Suspense fallback={null}>
            <Navigation />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  );
}

async function Navigation() {
  await requireSession();
  const context = await getRequestTenantContext();
  // Links are a convenience only; every page and action checks permissions on the server.
  const links = [
    { href: "/dashboard", label: "Dashboard", show: true },
    {
      href: "/dashboard/users",
      label: "Users",
      show: !!context && hasPermission(context, "users.read"),
    },
    { href: "/dashboard/profile", label: "My profile", show: true },
  ];
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {links
        .filter((link) => link.show)
        .map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted hover:bg-surface-muted hover:text-foreground rounded-md px-2.5 py-1.5"
          >
            {link.label}
          </Link>
        ))}
      <form action={logoutAction}>
        <button
          type="submit"
          className="text-muted hover:bg-surface-muted hover:text-foreground rounded-md px-2.5 py-1.5"
        >
          Sign out
        </button>
      </form>
    </nav>
  );
}
