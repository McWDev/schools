"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";

import { AccessFields, RoleFields, type BranchOption, type RoleOption } from "../access-fields";
import { inviteAction, type UserFormState } from "../actions";

export function InviteForm({
  roles,
  branches,
  canGrantSchoolScope,
}: {
  roles: RoleOption[];
  branches: BranchOption[];
  canGrantSchoolScope: boolean;
}) {
  const [state, formAction] = useActionState<UserFormState, FormData>(inviteAction, {});
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5" noValidate>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="displayName"
          label="Full name"
          autoComplete="off"
          defaultValue={state.values?.displayName}
          error={state.fieldErrors?.displayName}
        />
        <TextField
          name="email"
          label="Email address"
          type="email"
          autoComplete="off"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
      </div>
      <AccessFields
        branches={branches}
        canGrantSchoolScope={canGrantSchoolScope}
        error={state.fieldErrors?.access}
      />
      <RoleFields roles={roles} error={state.fieldErrors?.roleIds} />
      <div>
        <SubmitButton pendingLabel="Sending invitation…">Send invitation</SubmitButton>
      </div>
    </form>
  );
}
