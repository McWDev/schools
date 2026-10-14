"use client";

import { useEffect } from "react";

// Error boundary for signed-in pages. Shows a generic message; details stay in server logs.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="border-danger/30 bg-danger-surface rounded-xl border p-6">
      <h1 className="text-danger text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm">
        We could not load this page. Your data has not been changed. Try again, and contact support
        if the problem continues{error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground hover:bg-primary-hover mt-4 h-9 rounded-md px-3 text-sm font-semibold"
      >
        Try again
      </button>
    </div>
  );
}
