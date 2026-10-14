import Link from "next/link";
import type { ReactNode } from "react";

/** Shared presentational pieces for signed-in pages. Server-safe (no client hooks). */

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
        <Link href={backHref} className="text-muted hover:text-foreground w-fit text-sm">
          ← {backLabel ?? "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">{title}</h1>
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
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-xl border p-5 sm:p-6">
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {description && <p className="text-muted mt-1 text-sm">{description}</p>}
      <div className={title || description ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}

const badgeTones = {
  neutral: "border-border bg-surface-muted text-foreground",
  success: "border-success/30 bg-success-surface text-success",
  warning: "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
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
        className="bg-surface-muted rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="bg-surface-muted text-muted inline-flex items-center justify-center rounded-full text-xs font-semibold"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </span>
  );
}
