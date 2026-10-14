"use client";

import { useActionState, useSyncExternalStore } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";

import { resetPasswordAction, type FormState } from "../actions";

let capturedToken: string | null = null;

/**
 * Read the token from the URL fragment once, then remove it from the address bar and history so
 * it is not left on screen, in bookmarks, or in shared links. Fragments are never sent to the server.
 */
function readTokenFromFragment(): string {
  if (capturedToken === null) {
    const match = /(?:^|&)token=([A-Za-z0-9_-]{20,100})/.exec(window.location.hash.slice(1));
    capturedToken = match?.[1] ?? "";
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }
  return capturedToken;
}

const subscribe = () => () => {};

export function ResetPasswordForm() {
  const token = useSyncExternalStore(subscribe, readTokenFromFragment, () => null);
  const [state, formAction] = useActionState<FormState, FormData>(resetPasswordAction, {});

  if (token === null) return null;
  if (!token) {
    return <FormAlert tone="error">This reset link is incomplete. Request a new one.</FormAlert>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <input type="hidden" name="token" value={token} />
      <TextField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. A short phrase of several words works well."
        error={state.fieldErrors?.password}
      />
      <TextField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingLabel="Saving…">Save new password</SubmitButton>
    </form>
  );
}
