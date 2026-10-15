"use client";

import { useActionState, useState } from "react";

import { FormAlert, SelectField, SubmitButton, TextField } from "@/components/forms";
import { buttonClass } from "@/components/ui";

import {
  createClassAction,
  createGradeAction,
  createSectionAction,
  createTermAction,
  createYearAction,
  renameClassAction,
  setClassStatusAction,
  setCurrentYearAction,
  setGradeStatusAction,
  setSectionStatusAction,
  setTermStatusAction,
  setYearStatusAction,
  updateYearAction,
  type AcademicFormState,
} from "./actions";

type Option = { value: string; label: string };

function Feedback({ state }: { state: AcademicFormState }) {
  if (state.error) return <FormAlert tone="error">{state.error}</FormAlert>;
  if (state.message) return <FormAlert tone="success">{state.message}</FormAlert>;
  return null;
}

function valueOf(state: AcademicFormState, name: string, initial?: string | number | null) {
  return state.values?.[name] ?? (initial === null || initial === undefined ? "" : String(initial));
}

// ---------------------------------------------------------------- years and terms

export function YearForm({
  year,
}: {
  year?: { id: string; name: string; startsOn: string; endsOn: string };
}) {
  const [state, action] = useActionState<AcademicFormState, FormData>(
    year ? updateYearAction : createYearAction,
    {},
  );
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Feedback state={state} />
      {year && <input type="hidden" name="yearId" value={year.id} />}
      <TextField
        idPrefix="year"
        name="name"
        label="Year name"
        hint="For example 2026-2027."
        defaultValue={valueOf(state, "name", year?.name)}
        error={errors.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          idPrefix="year"
          name="startsOn"
          label="Starts on"
          type="date"
          defaultValue={valueOf(state, "startsOn", year?.startsOn)}
          error={errors.startsOn}
        />
        <TextField
          idPrefix="year"
          name="endsOn"
          label="Ends on"
          type="date"
          defaultValue={valueOf(state, "endsOn", year?.endsOn)}
          error={errors.endsOn}
        />
      </div>
      <div>
        <SubmitButton pendingLabel="Saving…">
          {year ? "Save academic year" : "Create academic year"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function TermForm({ yearId, nextSequence }: { yearId: string; nextSequence: number }) {
  const [state, action] = useActionState<AcademicFormState, FormData>(createTermAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="yearId" value={yearId} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField
          idPrefix="term"
          name="name"
          label="Term name"
          hint="For example Term 1 or Semester 2."
          defaultValue={valueOf(state, "name")}
          error={errors.name}
        />
        <TextField
          idPrefix="term"
          name="sequence"
          label="Position"
          type="number"
          defaultValue={valueOf(state, "sequence", nextSequence)}
          error={errors.sequence}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          idPrefix="term"
          name="startsOn"
          label="Term starts on"
          type="date"
          defaultValue={valueOf(state, "startsOn")}
          error={errors.startsOn}
        />
        <TextField
          idPrefix="term"
          name="endsOn"
          label="Term ends on"
          type="date"
          defaultValue={valueOf(state, "endsOn")}
          error={errors.endsOn}
        />
      </div>
      <div>
        <SubmitButton pendingLabel="Adding…">Add term</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- grade levels

export function GradeForm({ nextSortOrder }: { nextSortOrder: number }) {
  const [state, action] = useActionState<AcademicFormState, FormData>(createGradeAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <TextField
        name="name"
        label="Grade name"
        hint="For example Grade 1 or Form 4."
        defaultValue={valueOf(state, "name")}
        error={errors.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="code"
          label="Code"
          hint="Short and unique, e.g. G1."
          defaultValue={valueOf(state, "code")}
          error={errors.code}
        />
        <TextField
          name="sortOrder"
          label="Order"
          type="number"
          hint="Lower numbers are listed first."
          defaultValue={valueOf(state, "sortOrder", nextSortOrder)}
          error={errors.sortOrder}
        />
      </div>
      <div>
        <SubmitButton pendingLabel="Adding…">Add grade level</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- classes and sections

export function ClassForm({
  branches,
  years,
  grades,
  defaults,
}: {
  branches: Option[];
  years: Option[];
  grades: Option[];
  defaults: { branchId?: string; academicYearId?: string };
}) {
  const [state, action] = useActionState<AcademicFormState, FormData>(createClassAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="branchId"
          label="Branch"
          options={branches}
          defaultValue={valueOf(state, "branchId", defaults.branchId)}
          error={errors.branchId}
        />
        <SelectField
          name="academicYearId"
          label="Academic year"
          options={years}
          defaultValue={valueOf(state, "academicYearId", defaults.academicYearId)}
          error={errors.academicYearId}
        />
        <SelectField
          name="gradeLevelId"
          label="Grade level"
          options={grades}
          placeholder="Choose a grade"
          defaultValue={valueOf(state, "gradeLevelId")}
          error={errors.gradeLevelId}
        />
      </div>
      <TextField
        name="name"
        label="Class name"
        required={false}
        hint="Optional. Defaults to the grade name."
        defaultValue={valueOf(state, "name")}
        error={errors.name}
      />
      <div>
        <SubmitButton pendingLabel="Creating…">Create class</SubmitButton>
      </div>
    </form>
  );
}

export function RenameClassForm({ classId, name }: { classId: string; name: string }) {
  const [state, action] = useActionState<AcademicFormState, FormData>(renameClassAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="classId" value={classId} />
      <TextField
        idPrefix="class"
        name="name"
        label="Class name"
        defaultValue={valueOf(state, "name", name)}
        error={state.fieldErrors?.name}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save class name</SubmitButton>
      </div>
    </form>
  );
}

export function SectionForm({ classId }: { classId: string }) {
  const [state, action] = useActionState<AcademicFormState, FormData>(createSectionAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="classId" value={classId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          idPrefix="section"
          name="name"
          label="Section name"
          hint="For example A or Blue."
          defaultValue={valueOf(state, "name")}
          error={errors.name}
        />
        <TextField
          idPrefix="section"
          name="capacity"
          label="Capacity"
          type="number"
          required={false}
          hint="Optional seat limit."
          defaultValue={valueOf(state, "capacity")}
          error={errors.capacity}
        />
        <TextField
          idPrefix="section"
          name="room"
          label="Room"
          required={false}
          defaultValue={valueOf(state, "room")}
          error={errors.room}
        />
      </div>
      <div>
        <SubmitButton pendingLabel="Adding…">Add section</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- status changes

const STATUS_ACTIONS = {
  year: [setYearStatusAction, "yearId"],
  term: [setTermStatusAction, "termId"],
  grade: [setGradeStatusAction, "gradeId"],
  class: [setClassStatusAction, "classId"],
  section: [setSectionStatusAction, "sectionId"],
} as const;

/**
 * Archive or restore a record. Archiving asks for confirmation and explains that nothing is
 * deleted; restoring is immediate.
 */
export function StatusButton({
  kind,
  id,
  archived,
  label,
  explanation,
}: {
  kind: keyof typeof STATUS_ACTIONS;
  id: string;
  archived: boolean;
  /** Names the record for screen readers, e.g. "Term 1". */
  label: string;
  explanation?: string;
}) {
  const [handler, idName] = STATUS_ACTIONS[kind];
  const [state, action] = useActionState<AcademicFormState, FormData>(handler, {});
  const [confirming, setConfirming] = useState(false);

  if (!archived && !confirming) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Feedback state={state} />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={buttonClass("ghost", "sm")}
          aria-label={`Archive ${label}`}
        >
          Archive…
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <Feedback state={state} />
      <input type="hidden" name={idName} value={id} />
      <input type="hidden" name="status" value={archived ? "active" : "archived"} />
      {!archived && (
        <p className="text-muted max-w-sm text-xs">
          {explanation ?? "Archived records stay in history and can be restored at any time."}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className={buttonClass(archived ? "secondary" : "danger", "sm")}
          aria-label={archived ? `Restore ${label}` : `Yes, archive ${label}`}
        >
          {archived ? "Restore" : "Yes, archive"}
        </button>
        {!archived && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={buttonClass("ghost", "sm")}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function MakeCurrentButton({ yearId }: { yearId: string }) {
  const [state, action] = useActionState<AcademicFormState, FormData>(setCurrentYearAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <Feedback state={state} />
      <input type="hidden" name="yearId" value={yearId} />
      <SubmitButton pendingLabel="Saving…">Make current year</SubmitButton>
    </form>
  );
}
