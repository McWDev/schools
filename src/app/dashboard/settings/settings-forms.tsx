"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";

import {
  removeLogoAction,
  updateSettingsAction,
  uploadLogoAction,
  type SettingsFormState,
} from "./actions";

function Feedback({ state }: { state: SettingsFormState }) {
  if (state.error) return <FormAlert tone="error">{state.error}</FormAlert>;
  if (state.message) return <FormAlert tone="success">{state.message}</FormAlert>;
  return null;
}

export interface ProfileValues {
  name: string;
  shortName: string | null;
  timezone: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export function SchoolProfileForm({
  values,
  timezones,
}: {
  values: ProfileValues;
  timezones: string[];
}) {
  const [state, action] = useActionState<SettingsFormState, FormData>(updateSettingsAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField name="name" label="School name" defaultValue={values.name} error={errors.name} />
        <TextField
          name="shortName"
          label="Short name"
          required={false}
          hint="Shown where space is tight, e.g. EA."
          defaultValue={values.shortName ?? ""}
          error={errors.shortName}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="field-timezone" className="text-foreground text-sm font-medium">
          Timezone
        </label>
        <select
          id="field-timezone"
          name="timezone"
          defaultValue={values.timezone}
          aria-invalid={errors.timezone ? true : undefined}
          aria-describedby="field-timezone-hint"
          className="border-border bg-surface text-foreground focus:border-primary focus:ring-primary/20 h-10 max-w-md rounded-lg border px-3 text-sm outline-none focus:ring-4"
        >
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <p
          id="field-timezone-hint"
          className={errors.timezone ? "text-danger text-xs font-medium" : "text-muted text-xs"}
        >
          {errors.timezone ?? "Dates and times across the system are shown in this timezone."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="email"
          label="School email"
          type="email"
          required={false}
          defaultValue={values.email ?? ""}
          error={errors.email}
        />
        <TextField
          name="phone"
          label="Phone"
          required={false}
          defaultValue={values.phone ?? ""}
          error={errors.phone}
        />
      </div>
      <TextField
        name="address"
        label="Main address"
        required={false}
        defaultValue={values.address ?? ""}
        error={errors.address}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save school profile</SubmitButton>
      </div>
    </form>
  );
}

export function LogoForm({ hasLogo }: { hasLogo: boolean }) {
  const [state, upload] = useActionState<SettingsFormState, FormData>(uploadLogoAction, {});
  const [removeState, remove] = useActionState<SettingsFormState>(removeLogoAction, {});
  const error = state.fieldErrors?.logo;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Feedback state={state.fieldErrors ? {} : state} />
      <Feedback state={removeState} />
      <form action={upload} className="flex flex-col gap-2">
        <label htmlFor="logo" className="text-sm font-medium">
          Choose a logo
        </label>
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/webp,image/jpeg"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "logo-error" : "logo-hint"}
          className="file:border-border file:bg-surface text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm"
        />
        {error ? (
          <p id="logo-error" className="text-danger text-xs font-medium">
            {error}
          </p>
        ) : (
          <p id="logo-hint" className="text-muted text-xs">
            PNG with a transparent background works best. Up to 2 MB.
          </p>
        )}
        <div>
          <SubmitButton pendingLabel="Uploading…">Upload logo</SubmitButton>
        </div>
      </form>
      {hasLogo && (
        <form action={remove}>
          <button type="submit" className="text-danger text-sm font-medium hover:underline">
            Remove logo
          </button>
        </form>
      )}
    </div>
  );
}
