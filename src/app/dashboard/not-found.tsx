import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="border-border bg-surface rounded-xl border p-6">
      <h1 className="text-lg font-semibold">This page could not be found.</h1>
      <p className="text-muted mt-1 text-sm">
        It may have been removed, or you may not have access to it.
      </p>
      <Link
        href="/dashboard"
        className="text-primary mt-4 inline-block text-sm font-medium hover:underline"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
