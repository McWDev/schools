import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm, ResetNotice } from "./login-form";

export const metadata: Metadata = { title: "Sign in · School Management" };

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-foreground text-xl font-semibold">Sign in</h1>
        <p className="text-muted mt-1 text-sm">
          Use the email address your school registered for you.
        </p>
      </div>
      <Suspense fallback={null}>
        <ResetNotice />
      </Suspense>
      <LoginForm />
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary font-medium hover:underline">
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}
