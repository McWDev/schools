"use client";

import { useActionState, useState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";
import { buttonClass } from "@/components/ui";

import {
  AccessFields,
  ConfirmPasswordField,
  RoleFields,
  type BranchOption,
  type RoleOption,
} from "../access-fields";
import {
  resendInvitationAction,
  updateAccessAction,
  updateProfileAction,
  updateRolesAction,
  updateStatusAction,
  type UserFormState,
} from "../actions";

function Feedback({ state }: { state: UserFormState }) {
  if (state.error) return <FormAlert tone="error">{state.error}</FormAlert>;
  if (state.message) return <FormAlert tone="success">{state.message}</FormAlert>;
  return null;
}

export function DetailsForm({ userId, displayName }: { userId: string; displayName: string }) {
  const [state, action] = useActionState<UserFormState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="userId" value={userId} />
      <TextField
        name="displayName"
        label="Full name"
        defaultValue={displayName}
        error={state.fieldErrors?.displayName}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
      </div>
    </form>
  );
}

export function RolesForm({
  userId,
  roles,
  selected,
  needsPassword,
}: {
  userId: string;
  roles: RoleOption[];
  selected: string[];
  needsPassword: boolean;
}) {
  const [state, action] = useActionState<UserFormState, FormData>(updateRolesAction, {});
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="userId" value={userId} />
      <RoleFields
        roles={roles}
        selected={selected}
        error={state.fieldErrors?.form ?? state.fieldErrors?.["0"]}
      />
      {(needsPassword || state.needsPassword) && (
        <ConfirmPasswordField error={state.fieldErrors?.currentPassword} />
      )}
      <div>
        <SubmitButton pendingLabel="Saving…">Save roles</SubmitButton>
      </div>
    </form>
  );
}

export function AccessForm({
  userId,
  branches,
  canGrantSchoolScope,
  scope,
  selectedBranches,
  needsPassword,
}: {
  userId: string;
  branches: BranchOption[];
  canGrantSchoolScope: boolean;
  scope: "school" | "branch";
  selectedBranches: string[];
  needsPassword: boolean;
}) {
  const [state, action] = useActionState<UserFormState, FormData>(updateAccessAction, {});
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="userId" value={userId} />
      <AccessFields
        branches={branches}
        canGrantSchoolScope={canGrantSchoolScope}
        scope={scope}
        selectedBranches={selectedBranches}
        error={state.fieldErrors?.branchIds}
      />
      {(needsPassword || state.needsPassword) && (
        <ConfirmPasswordField error={state.fieldErrors?.currentPassword} />
      )}
      <div>
        <SubmitButton pendingLabel="Saving…">Save access</SubmitButton>
      </div>
    </form>
  );
}

export function StatusForm({
  userId,
  suspended,
  name,
  needsPassword,
}: {
  userId: string;
  suspended: boolean;
  name: string;
  needsPassword: boolean;
}) {
  const [state, action] = useActionState<UserFormState, FormData>(updateStatusAction, {});
  const [confirming, setConfirming] = useState(false);

  if (!suspended && !confirming && !state.needsPassword && !state.error) {
    return (
      <div className="flex flex-col gap-3">
        <Feedback state={state} />
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={buttonClass("danger")}
          >
            Remove access…
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={suspended ? "active" : "deactivated"} />
      {!suspended && (
        <p className="text-sm">
          Remove <strong>{name}</strong>&rsquo;s access?
        </p>
      )}
      {(needsPassword || state.needsPassword) && (
        <ConfirmPasswordField error={state.fieldErrors?.currentPassword} />
      )}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">
          {suspended ? "Restore access" : "Yes, remove access"}
        </SubmitButton>
        {!suspended && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={buttonClass("secondary")}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function ResendInvitationForm({ userId }: { userId: string }) {
  const [state, action] = useActionState<UserFormState, FormData>(resendInvitationAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-muted text-sm">This person has not accepted their invitation yet.</p>
      <button type="submit" className="text-primary text-sm font-medium hover:underline">
        Send a new invitation link
      </button>
      {state.message && (
        <span role="status" className="text-success text-sm">
          {state.message}
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}
