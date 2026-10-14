"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";

import { isActive, type NavGroup } from "./navigation";

function Sidebar({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-6 px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-muted px-3 pb-1.5 text-xs font-semibold tracking-wide uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground hover:bg-surface-muted"
                    }`}
                  >
                    <Icon name={item.icon} />
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

/**
 * Responsive application frame: fixed sidebar on wide screens, an accessible drawer on small
 * screens (focus moves into it, Escape and route changes close it).
 */
export function AppShell({
  groups,
  topBar,
  children,
}: {
  groups: NavGroup[];
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

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold">
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md"
      >
        <Icon name="building" />
      </span>
      School Management
    </Link>
  );

  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="border-border bg-surface hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="border-border flex h-14 items-center border-b px-5">{brand}</div>
        <Sidebar groups={groups} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="bg-surface absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-xl"
          >
            <div className="border-border flex h-14 items-center justify-between border-b px-4">
              {brand}
              <button
                ref={closeButton}
                type="button"
                onClick={() => setOpen(false)}
                className="hover:bg-surface-muted rounded-md p-2"
                aria-label="Close navigation"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto">
              <Sidebar groups={groups} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 sm:px-5">
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="hover:bg-surface-muted rounded-md p-2 md:hidden"
            aria-label="Open navigation"
          >
            <Icon name="menu" className="size-5" />
          </button>
          {topBar}
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8"
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
        className="hover:bg-surface-muted flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-sm [&::-webkit-details-marker]:hidden"
      >
        {summary}
        <Icon name="chevron" className="text-muted size-4" />
      </summary>
      <div
        className={`border-border bg-surface absolute z-40 mt-1 w-64 max-w-[calc(100vw-1.5rem)] rounded-lg border p-1 shadow-lg ${
          align === "end" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </div>
    </details>
  );
}
