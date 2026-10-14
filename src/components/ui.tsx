import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/icons";

/** Shared presentational pieces. Server-safe (no client hooks). */

const buttonVariants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-card",
  secondary: "border-border bg-surface text-foreground hover:bg-surface-muted border shadow-card",
  danger: "border-danger/40 text-danger hover:bg-danger-surface border bg-transparent",
  ghost: "text-muted hover:bg-surface-muted hover:text-foreground",
} as const;

/** One button style for links and buttons alike. */
export function buttonClass(
  variant: keyof typeof buttonVariants = "primary",
  size: "sm" | "md" = "md",
): string {
  const sizes = size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm";
  return `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-wait disabled:opacity-70 ${sizes} ${buttonVariants[variant]}`;
}

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {backHref && (
        <Link
          href={backHref}
          className="text-muted hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
        >
          <span aria-hidden="true">←</span> {backLabel ?? "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {title}
          </h1>
          {description && <p className="text-muted mt-1 text-sm">{description}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const hasHeader = title || description || actions;
  return (
    <section className="border-border bg-surface shadow-card rounded-2xl border">
      {hasHeader && (
        <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

const statTones = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
} as const;

export function StatCard({
  label,
  value,
  detail,
  href,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  href?: string;
  icon: Parameters<typeof Icon>[0]["name"];
  tone?: keyof typeof statTones;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted text-sm font-medium">{label}</p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${statTones[tone]}`}>
          <Icon name={icon} className="size-[18px]" />
        </span>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {detail && <p className="text-muted mt-1 text-xs">{detail}</p>}
    </>
  );
  const base = "border-border bg-surface shadow-card rounded-2xl border p-5 block";
  return href ? (
    <Link
      href={href}
      className={`${base} hover:border-primary/50 transition-colors focus-visible:outline-offset-4`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

const badgeTones = {
  neutral: "border-border bg-surface-muted text-foreground",
  success: "border-success/30 bg-success-surface text-success",
  warning: "border-warning/30 bg-warning-surface text-warning",
  danger: "border-danger/30 bg-danger-surface text-danger",
} as const;

/** Status badge: always text, never color alone. */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function NoAccess({ message }: { message?: string }) {
  return (
    <Card title="You don't have access to this page">
      <p className="text-muted text-sm">
        {message ?? "Ask a school administrator if you need this access."}
      </p>
    </Card>
  );
}

export function Avatar({
  userId,
  name,
  hasPhoto,
  size = 40,
}: {
  userId: string;
  name: string;
  hasPhoto: boolean;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  if (hasPhoto) {
    return (
      // Served by an authorized route handler, so next/image optimization is not used.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/avatars/${userId}`}
        alt=""
        width={size}
        height={size}
        className="bg-surface-muted ring-border rounded-full object-cover ring-1"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="bg-primary-soft text-primary inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {initials || "?"}
    </span>
  );
}
