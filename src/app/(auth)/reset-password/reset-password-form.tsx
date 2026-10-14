"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";
import { useFragmentToken } from "@/lib/use-fragment-token";

import { resetPasswordAction, type FormState } from "../actions";

export function ResetPasswordForm() {
  const token = useFragmentToken();
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
