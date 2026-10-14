"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";

import { forgotPasswordAction, type FormState } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  if (state.message) return <FormAlert tone="success">{state.message}</FormAlert>;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <TextField
        name="email"
        label="Email address"
        type="email"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
