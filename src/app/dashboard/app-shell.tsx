"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme";

import { isActive, type NavGroup } from "./navigation";

function Sidebar({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-6 px-3 py-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-sidebar-muted px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-sidebar-active-bg text-sidebar-active font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-active-bg hover:text-sidebar-active"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="bg-accent absolute top-1.5 bottom-1.5 left-0 w-1 rounded-full"
                      />
                    )}
                    <Icon name={item.icon} className="size-[18px]" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ schoolName }: { schoolName: string }) {
  const initials = schoolName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="from-hero-from to-hero-to grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-md"
      >
        {initials || <Icon name="building" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{schoolName}</span>
        <span className="text-sidebar-muted block text-[11px] tracking-wide">
          School Management
        </span>
      </span>
    </Link>
  );
}

/**
 * Responsive application frame: fixed sidebar on wide screens, an accessible drawer on small
 * screens (focus moves into it, Escape and route changes close it).
 */
export function AppShell({
  groups,
  schoolName,
  topBar,
  children,
}: {
  groups: NavGroup[];
  schoolName: string;
  topBar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  // Close the drawer after navigation.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const sidebarFooter = (
    <div className="mt-auto border-t border-white/10 px-4 py-4">
      <p className="text-sidebar-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
        Appearance
      </p>
      {/* The toggle uses theme tokens; keep it legible on the dark sidebar in light mode too. */}
      <div data-theme="dark" className="contents">
        <ThemeToggle />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="bg-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 flex-col md:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Brand schoolName={schoolName} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar groups={groups} />
        </div>
        {sidebarFooter}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="bg-sidebar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-4">
              <Brand schoolName={schoolName} />
              <button
                ref={closeButton}
                type="button"
                onClick={() => setOpen(false)}
                className="text-sidebar-foreground rounded-lg p-2 hover:bg-white/10"
                aria-label="Close navigation"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar groups={groups} onNavigate={() => setOpen(false)} />
            </div>
            {sidebarFooter}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface/85 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 backdrop-blur-md sm:px-6">
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="hover:bg-surface-muted rounded-lg p-2 md:hidden"
            aria-label="Open navigation"
          >
            <Icon name="menu" className="size-5" />
          </button>
          {topBar}
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Disclosure menu built on <details>, so it works with the keyboard and without JavaScript.
 * Closes on outside click and Escape.
 */
export function MenuButton({
  label,
  summary,
  children,
  align = "start",
}: {
  label: string;
  summary: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={label}
        className="border-border hover:bg-surface-muted flex cursor-pointer list-none items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-sm transition-colors open:border-current/10 [&::-webkit-details-marker]:hidden"
      >
        {summary}
        <Icon name="chevron" className="text-muted size-4" />
      </summary>
      <div
        className={`border-border bg-surface-raised absolute z-40 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border p-1.5 shadow-xl ${
          align === "end" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </div>
    </details>
  );
}
