"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";

import {
  changePasswordAction,
  removeAvatarAction,
  updateNameAction,
  uploadAvatarAction,
  type ProfileFormState,
} from "./actions";

function Feedback({ state }: { state: ProfileFormState }) {
  if (state.error) return <FormAlert tone="error">{state.error}</FormAlert>;
  if (state.message) return <FormAlert tone="success">{state.message}</FormAlert>;
  return null;
}

export function PhotoForm({ hasPhoto }: { hasPhoto: boolean }) {
  const [state, upload] = useActionState<ProfileFormState, FormData>(uploadAvatarAction, {});
  const [removeState, remove] = useActionState<ProfileFormState>(removeAvatarAction, {});
  const error = state.fieldErrors?.photo;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Feedback state={state.fieldErrors ? {} : state} />
      <Feedback state={removeState} />
      <form action={upload} className="flex flex-col gap-2">
        <label htmlFor="photo" className="text-sm font-medium">
          Choose a photo
        </label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "photo-error" : undefined}
          className="file:border-border file:bg-surface text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
        />
        {error && (
          <p id="photo-error" className="text-danger text-xs font-medium">
            {error}
          </p>
        )}
        <div>
          <SubmitButton pendingLabel="Uploading…">Upload photo</SubmitButton>
        </div>
      </form>
      {hasPhoto && (
        <form action={remove}>
          <button type="submit" className="text-danger text-sm font-medium hover:underline">
            Remove photo
          </button>
        </form>
      )}
    </div>
  );
}

export function NameForm({ displayName }: { displayName: string }) {
  const [state, action] = useActionState<ProfileFormState, FormData>(updateNameAction, {});
  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      <Feedback state={state} />
      <TextField
        name="displayName"
        label="Full name"
        autoComplete="name"
        defaultValue={displayName}
        error={state.fieldErrors?.displayName}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save name</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<ProfileFormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      <Feedback state={state} />
      <TextField
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.currentPassword}
      />
      <TextField
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters."
        error={state.fieldErrors?.newPassword}
      />
      <TextField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>
      </div>
    </form>
  );
}
