"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";

import { loginAction, type FormState } from "../actions";

export function LoginForm() {
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <TextField
        name="email"
        label="Email address"
        type="email"
        autoComplete="username"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function ResetNotice() {
  const params = useSearchParams();
  if (params.get("reset") === "1") {
    return (
      <FormAlert tone="success">
        Your password was changed. Sign in with the new password.
      </FormAlert>
    );
  }
  if (params.get("activated") === "1") {
    return (
      <FormAlert tone="success">Your account is active. Sign in with your new password.</FormAlert>
    );
  }
  return null;
}
