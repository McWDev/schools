import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <p className="text-muted text-sm font-semibold tracking-wide uppercase">School Management</p>
      <h1 className="text-foreground text-3xl font-semibold">Run every campus from one place</h1>
      <p className="text-muted">
        Students, staff, attendance, exams, and fees for your whole school and each of its branches.
      </p>
      <div>
        <Link
          href="/login"
          className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
