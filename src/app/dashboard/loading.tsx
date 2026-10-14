export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="bg-surface-muted h-8 w-56 animate-pulse rounded-md" />
      <div className="border-border bg-surface h-40 animate-pulse rounded-xl border" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
