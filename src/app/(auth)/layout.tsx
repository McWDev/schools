export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-muted mb-6 text-center text-sm font-semibold tracking-wide uppercase">
          School Management
        </p>
        <div className="border-border bg-surface rounded-xl border p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
