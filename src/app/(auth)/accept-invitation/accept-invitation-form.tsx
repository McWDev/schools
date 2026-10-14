"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";
import { useFragmentToken } from "@/lib/use-fragment-token";

import { acceptInvitationAction, type FormState } from "../actions";

export function AcceptInvitationForm() {
  const token = useFragmentToken();
  const [state, formAction] = useActionState<FormState, FormData>(acceptInvitationAction, {});

  if (token === null) return null;
  if (!token) {
    return (
      <FormAlert tone="error">
        This invitation link is incomplete. Ask your school administrator to send a new one.
      </FormAlert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <input type="hidden" name="token" value={token} />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. A short phrase of several words works well."
        error={state.fieldErrors?.password}
      />
      <TextField
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingLabel="Activating…">Activate account</SubmitButton>
      <p className="text-muted text-center text-sm">
        Already set up?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
