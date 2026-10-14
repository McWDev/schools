import { connection } from "next/server";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme";
import { getSchoolProfile } from "@/server/access/school";
import { getDatabase } from "@/server/db/client";

/** The school's name from its profile, read at request time (it can change in Settings). */
async function SchoolName({ className }: { className?: string }) {
  await connection();
  const school = await getSchoolProfile(getDatabase());
  return <span className={className}>{school.name}</span>;
}

const highlights = [
  { icon: "map-pin" as const, text: "Every branch, each in its own area, in one place" },
  { icon: "users" as const, text: "Staff see exactly the branches they work in" },
  { icon: "badge" as const, text: "Secure sign-in and a full audit trail" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="from-hero-from to-hero-to relative hidden overflow-hidden bg-gradient-to-br p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-20 size-80 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 size-96 translate-x-1/3 translate-y-1/3 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Icon name="building" className="size-5" />
          </span>
          <Suspense fallback={<span className="text-lg font-semibold">School Management</span>}>
            <SchoolName className="text-lg font-semibold" />
          </Suspense>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            One school. Every branch. One system.
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-white/90">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15">
                  <Icon name={item.icon} />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">School Management System</p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="absolute top-4 right-4">
          <ThemeToggle compact />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <span className="from-hero-from to-hero-to grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white">
              <Icon name="building" className="size-5" />
            </span>
            <Suspense fallback={<span className="font-semibold">School Management</span>}>
              <SchoolName className="font-semibold" />
            </Suspense>
          </div>
          <div className="border-border bg-surface shadow-card rounded-2xl border p-6 sm:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
