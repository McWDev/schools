import { connection } from "next/server";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme";
import { getSchoolProfile } from "@/server/access/school";
import { getDatabase } from "@/server/db/client";

/**
 * The school's logo on a solid white tile, so logos of any colour stay clearly visible. Until a
 * logo is uploaded in School settings, a building emblem stands in.
 */
async function SchoolLogo({ size }: { size: "lg" | "sm" }) {
  await connection();
  const school = await getSchoolProfile(getDatabase());
  const tile =
    size === "lg"
      ? "size-40 rounded-[2rem] p-5 shadow-2xl ring-8 ring-white/15"
      : "size-14 rounded-2xl p-2 shadow-md ring-1 ring-black/5";
  return school.logoUrl ? (
    // Our own route serves a re-encoded image; next/image optimization is not needed here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={school.logoUrl}
      alt={`${school.name} logo`}
      className={`${tile} bg-white object-contain`}
    />
  ) : (
    <span
      role="img"
      aria-label={`${school.name} logo`}
      className={`${tile} grid place-items-center bg-white`}
    >
      <Icon
        name="building"
        className={size === "lg" ? "size-16 text-[#4338ca]" : "size-7 text-[#4338ca]"}
      />
    </span>
  );
}

async function Welcome({ compact = false }: { compact?: boolean }) {
  await connection();
  const school = await getSchoolProfile(getDatabase());
  return compact ? (
    <p className="text-foreground text-lg font-semibold tracking-tight">{school.name}</p>
  ) : (
    <div className="flex flex-col items-center gap-4">
      <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight text-balance">
        {school.name}
      </h2>
      <span aria-hidden="true" className="h-1 w-12 rounded-full bg-white/50" />
      <p className="max-w-sm text-lg text-white/85">
        Welcome! Sign in to continue to your school&rsquo;s management system.
      </p>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <aside className="from-hero-from to-hero-to relative hidden overflow-hidden bg-gradient-to-br text-white lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgb(255_255_255/0.16),transparent_55%)]"
        />
        <div className="relative flex flex-col items-center gap-8 text-center">
          <Suspense fallback={<span className="block size-40 rounded-[2rem] bg-white/15" />}>
            <SchoolLogo size="lg" />
          </Suspense>
          <Suspense fallback={<span className="block h-28" />}>
            <Welcome />
          </Suspense>
        </div>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="absolute top-4 right-4">
          <ThemeToggle compact />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <Suspense fallback={<span className="bg-surface-muted block size-14 rounded-2xl" />}>
              <SchoolLogo size="sm" />
            </Suspense>
            <Suspense fallback={null}>
              <Welcome compact />
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
