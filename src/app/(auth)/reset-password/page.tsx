import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password · School Management",
  // The page carries a secret in its URL fragment; keep it out of search engines.
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-foreground text-xl font-semibold">Choose a new password</h1>
        <p className="text-muted mt-1 text-sm">
          Signing in with the new password will end your sessions on other devices.
        </p>
      </div>
      <ResetPasswordForm />
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary font-medium hover:underline">
          Request a new link
        </Link>
      </p>
    </div>
  );
}
