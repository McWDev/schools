import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Avatar, Card, PageHeader } from "@/components/ui";
import { requireSession } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { users } from "@/server/db/schema";

import { NameForm, PasswordForm, PhotoForm } from "./profile-forms";

export const metadata: Metadata = { title: "My profile · School Management" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="My profile" description="Your name, photo, and password." />
      <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
        <ProfileContent />
      </Suspense>
    </>
  );
}

async function ProfileContent() {
  const session = await requireSession();
  const [me] = await getDatabase()
    .select({ hasPhoto: users.avatarKey })
    .from(users)
    .where(eq(users.id, session.userId));
  const hasPhoto = Boolean(me?.hasPhoto);

  return (
    <>
      <Card title="Photo" description="JPEG, PNG, or WebP, up to 2 MB. It is cropped to a square.">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar
            userId={session.userId}
            name={session.displayName}
            hasPhoto={hasPhoto}
            size={72}
          />
          <PhotoForm hasPhoto={hasPhoto} />
        </div>
      </Card>
      <Card title="Name">
        <NameForm displayName={session.displayName} />
      </Card>
      <Card
        title="Password"
        description="Changing your password signs you out on your other devices."
      >
        <PasswordForm />
      </Card>
    </>
  );
}
