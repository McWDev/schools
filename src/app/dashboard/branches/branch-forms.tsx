"use client";

import { useActionState, useState } from "react";

import { FormAlert, SubmitButton, TextField } from "@/components/forms";
import { buttonClass } from "@/components/ui";

import {
  createBranchAction,
  setBranchStatusAction,
  updateBranchAction,
  type BranchFormState,
} from "./actions";

export interface BranchValues {
  name: string;
  code: string;
  area: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

function Feedback({ state }: { state: BranchFormState }) {
  if (state.error) return <FormAlert tone="error">{state.error}</FormAlert>;
  if (state.message) return <FormAlert tone="success">{state.message}</FormAlert>;
  return null;
}

function Fields({ state, initial }: { state: BranchFormState; initial?: BranchValues }) {
  const errors = state.fieldErrors ?? {};
  const value = (name: keyof BranchValues) => state.values?.[name] ?? initial?.[name] ?? "";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField
          name="name"
          label="Branch name"
          defaultValue={value("name")}
          error={errors.name}
        />
        <TextField
          name="code"
          label="Code"
          hint="Short unique code, e.g. MAIN or NORTH."
          defaultValue={value("code")}
          error={errors.code}
        />
      </div>
      <TextField
        name="area"
        label="Area"
        required={false}
        hint="Town, district, or neighbourhood this branch serves."
        defaultValue={value("area")}
        error={errors.area}
      />
      <TextField
        name="address"
        label="Address"
        required={false}
        defaultValue={value("address")}
        error={errors.address}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="phone"
          label="Phone"
          required={false}
          defaultValue={value("phone")}
          error={errors.phone}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          required={false}
          defaultValue={value("email")}
          error={errors.email}
        />
      </div>
    </>
  );
}

export function NewBranchForm() {
  const [state, action] = useActionState<BranchFormState, FormData>(createBranchAction, {});
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5" noValidate>
      <Feedback state={state} />
      <Fields state={state} />
      <div>
        <SubmitButton pendingLabel="Opening branch…">Open branch</SubmitButton>
      </div>
    </form>
  );
}

export function EditBranchForm({ branchId, values }: { branchId: string; values: BranchValues }) {
  const [state, action] = useActionState<BranchFormState, FormData>(updateBranchAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="branchId" value={branchId} />
      <Fields state={state} initial={values} />
      <div>
        <SubmitButton pendingLabel="Saving…">Save branch details</SubmitButton>
      </div>
    </form>
  );
}

export function BranchStatusForm({
  branchId,
  name,
  active,
}: {
  branchId: string;
  name: string;
  active: boolean;
}) {
  const [state, action] = useActionState<BranchFormState, FormData>(setBranchStatusAction, {});
  const [confirming, setConfirming] = useState(false);

  if (active && !confirming) {
    return (
      <div className="flex flex-col gap-3">
        <Feedback state={state} />
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={buttonClass("danger")}
          >
            Deactivate branch…
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="status" value={active ? "inactive" : "active"} />
      {active && (
        <p className="text-sm">
          Deactivate <strong>{name}</strong>? It will no longer appear in branch selectors or accept
          new work. Its staff assignments, records, and history are kept, and you can reopen it at
          any time.
        </p>
      )}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">
          {active ? "Yes, deactivate branch" : "Reopen branch"}
        </SubmitButton>
        {active && (
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
