"use client";

import { useSyncExternalStore } from "react";

import { Icon } from "@/components/icons";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

/**
 * Runs in <head> before the first paint: applies the stored preference (or the OS setting) so
 * pages never flash the wrong theme. Kept tiny and dependency-free; it only reads localStorage.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}");var d=p==="dark"||((!p||p==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(preference: ThemePreference): void {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Follow the operating system while the preference is "system".
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (readPreference() === "system") apply("system");
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", listener);
  };
}

function setPreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable (private mode); the choice still applies to this page.
  }
  apply(preference);
  listeners.forEach((listener) => listener());
}

const OPTIONS: { value: ThemePreference; label: string; icon: "sun" | "moon" | "monitor" }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

/** Segmented Light / Dark / System control. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const current = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="border-border bg-surface-muted inline-flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      {OPTIONS.map((option) => {
        const selected = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={compact ? `${option.label} theme` : undefined}
            onClick={() => setPreference(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              selected
                ? "bg-surface text-foreground shadow-card"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Icon name={option.icon} className="size-3.5" />
            {!compact && option.label}
          </button>
        );
      })}
    </div>
  );
}
