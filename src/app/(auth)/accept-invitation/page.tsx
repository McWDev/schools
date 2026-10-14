import type { Metadata } from "next";

import { AcceptInvitationForm } from "./accept-invitation-form";

export const metadata: Metadata = {
  title: "Activate your account · School Management",
  robots: { index: false, follow: false },
};

export default function AcceptInvitationPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-foreground text-xl font-semibold">Activate your account</h1>
        <p className="text-muted mt-1 text-sm">
          Choose a password to finish setting up your account.
        </p>
      </div>
      <AcceptInvitationForm />
    </div>
  );
}
