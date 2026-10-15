import type { Metadata } from "next";
import { Suspense } from "react";

import { Icon } from "@/components/icons";
import { Card, NoAccess, PageHeader } from "@/components/ui";
import { hasPermission } from "@/server/access/context";
import { getRequestSchool, requireAccess } from "@/server/auth/request";
import { getDatabase } from "@/server/db/client";
import { getSchoolSettings, supportedTimezones } from "@/server/modules/settings/service";

import { LogoForm, SchoolProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "School settings · School Management" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="School settings"
        description="The school's profile, shown across the system, on sign-in pages, and in emails."
      />
      <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const { access } = await requireAccess();
  if (!hasPermission(access, "school.settings.manage")) return <NoAccess />;
  const [settings, school] = await Promise.all([
    getSchoolSettings(getDatabase(), access),
    getRequestSchool(),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title="School profile" description="Name, timezone, and contact details.">
          <SchoolProfileForm values={settings} timezones={supportedTimezones()} />
        </Card>
      </div>
      <Card title="Logo" description="Shown in the sidebar and on sign-in pages.">
        <div className="flex flex-col gap-5">
          <div className="border-border bg-surface-muted grid h-32 place-items-center rounded-xl border border-dashed">
            {school.logoUrl ? (
              // Served by our own route; next/image optimization is not needed for one small file.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={school.logoUrl}
                alt="Current school logo"
                className="max-h-24 max-w-[80%]"
              />
            ) : (
              <span className="text-subtle flex flex-col items-center gap-1 text-sm">
                <Icon name="building" className="size-6" />
                No logo yet
              </span>
            )}
          </div>
          <LogoForm hasLogo={settings.hasLogo} />
        </div>
      </Card>
    </div>
  );
}
