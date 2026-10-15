"use client";

import { useActionState } from "react";

import { FormAlert, SelectField, SubmitButton, TextField } from "@/components/forms";

import {
  addGuardianAction,
  admitStudentAction,
  placeStudentAction,
  removeStudentPhotoAction,
  setStudentStatusAction,
  transferStudentAction,
  updateStudentAction,
  uploadStudentPhotoAction,
  type StudentFormState,
} from "./actions";

type Option = { value: string; label: string };

const GENDERS: Option[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

const STATUSES: Option[] = [
  { value: "enrolled", label: "Enrolled" },
  { value: "suspended", label: "Suspended" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "graduated", label: "Graduated" },
];

function Feedback({ state }: { state: StudentFormState }) {
  if (state.error) return <FormAlert tone="error">{state.error}</FormAlert>;
  if (state.message) return <FormAlert tone="success">{state.message}</FormAlert>;
  return null;
}

function valueOf(state: StudentFormState, name: string, initial?: string | null) {
  return state.values?.[name] ?? initial ?? "";
}

export interface StudentPersonValues {
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  previousSchool: string | null;
  phone?: string | null;
  address?: string | null;
  medicalNotes?: string | null;
}

function PersonFields({
  state,
  initial,
  sensitive,
}: {
  state: StudentFormState;
  initial?: StudentPersonValues;
  sensitive: boolean;
}) {
  const errors = state.fieldErrors ?? {};
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="firstName"
          label="First name"
          defaultValue={valueOf(state, "firstName", initial?.firstName)}
          error={errors.firstName}
        />
        <TextField
          name="middleName"
          label="Middle name"
          required={false}
          defaultValue={valueOf(state, "middleName", initial?.middleName)}
          error={errors.middleName}
        />
        <TextField
          name="lastName"
          label="Last name"
          defaultValue={valueOf(state, "lastName", initial?.lastName)}
          error={errors.lastName}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="dateOfBirth"
          label="Date of birth"
          type="date"
          defaultValue={valueOf(state, "dateOfBirth", initial?.dateOfBirth)}
          error={errors.dateOfBirth}
        />
        <SelectField
          name="gender"
          label="Gender"
          options={GENDERS}
          placeholder="Choose"
          defaultValue={valueOf(state, "gender", initial?.gender)}
          error={errors.gender}
        />
        <TextField
          name="previousSchool"
          label="Previous school"
          required={false}
          defaultValue={valueOf(state, "previousSchool", initial?.previousSchool)}
          error={errors.previousSchool}
        />
      </div>
      {sensitive && (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="phone"
            label="Student phone"
            required={false}
            hint="Optional, for older students."
            defaultValue={valueOf(state, "phone", initial?.phone)}
            error={errors.phone}
          />
          <TextField
            name="address"
            label="Home address"
            required={false}
            defaultValue={valueOf(state, "address", initial?.address)}
            error={errors.address}
          />
          <TextField
            name="medicalNotes"
            label="Medical notes"
            required={false}
            hint="Allergies or conditions staff should know about."
            defaultValue={valueOf(state, "medicalNotes", initial?.medicalNotes)}
            error={errors.medicalNotes}
          />
        </div>
      )}
    </>
  );
}

const IMAGE_TYPES = "image/jpeg,image/png,image/webp";

function PhotoInput({ error, hint }: { error?: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="field-photo" className="text-sm font-medium">
        Student photo
      </label>
      <input
        id="field-photo"
        name="photo"
        type="file"
        accept={IMAGE_TYPES}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "field-photo-hint field-photo-error" : "field-photo-hint"}
        className="file:border-border file:bg-surface text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
      />
      <p id="field-photo-hint" className="text-muted text-xs">
        {hint}
      </p>
      {error && (
        <p id="field-photo-error" className="text-danger text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

export function AdmissionForm({
  branches,
  sections,
  defaults,
  sensitive,
}: {
  branches: Option[];
  /** Sections across the user's branches, labelled with their branch. */
  sections: Option[];
  defaults: { branchId?: string; admissionDate: string };
  sensitive: boolean;
}) {
  const [state, action] = useActionState<StudentFormState, FormData>(admitStudentAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <Feedback state={state} />
      {state.duplicate && (
        <div
          role="alert"
          className="border-warning/30 bg-warning-surface text-warning flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm"
        >
          <p>
            <span className="font-semibold">Possible duplicate: </span>
            {state.duplicate} Check the existing record before admitting again.
          </p>
          <label className="text-foreground flex items-center gap-2 font-medium">
            <input type="checkbox" name="confirmDuplicate" className="size-4" />
            This is a different student. Admit anyway.
          </label>
        </div>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-sm font-semibold">Student</legend>
        <PersonFields state={state} sensitive={sensitive} />
        <PhotoInput
          error={errors.photo}
          hint={
            state.duplicate || state.error
              ? "Optional. JPEG, PNG, or WebP up to 2 MB. Choose the photo again before resubmitting."
              : "Optional. JPEG, PNG, or WebP up to 2 MB, at least 64 × 64 pixels."
          }
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-sm font-semibold">Enrolment</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="branchId"
            label="Branch"
            options={branches}
            defaultValue={valueOf(state, "branchId", defaults.branchId)}
            error={errors.branchId}
          />
          <SelectField
            name="sectionId"
            label="Class and section"
            options={sections}
            placeholder="Not placed yet"
            hint="Must belong to the chosen branch."
            defaultValue={valueOf(state, "sectionId")}
            error={errors.sectionId}
          />
          <TextField
            name="admissionDate"
            label="Admission date"
            type="date"
            defaultValue={valueOf(state, "admissionDate", defaults.admissionDate)}
            error={errors.admissionDate}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-sm font-semibold">Primary guardian</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="guardianFullName"
            label="Guardian name"
            defaultValue={valueOf(state, "guardianFullName")}
            error={errors["guardian.fullName"]}
          />
          <TextField
            name="guardianRelationship"
            label="Relationship"
            hint="For example Mother, Father, or Uncle."
            defaultValue={valueOf(state, "guardianRelationship")}
            error={errors["guardian.relationship"]}
          />
        </div>
        {sensitive && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="guardianPhone"
              label="Guardian phone"
              required={false}
              defaultValue={valueOf(state, "guardianPhone")}
              error={errors["guardian.phone"]}
            />
            <TextField
              name="guardianEmail"
              label="Guardian email"
              type="email"
              required={false}
              defaultValue={valueOf(state, "guardianEmail")}
              error={errors["guardian.email"]}
            />
          </div>
        )}
      </fieldset>

      <div>
        <SubmitButton pendingLabel="Admitting…">Admit student</SubmitButton>
      </div>
    </form>
  );
}

export function EditStudentForm({
  studentId,
  values,
  sensitive,
}: {
  studentId: string;
  values: StudentPersonValues;
  sensitive: boolean;
}) {
  const [state, action] = useActionState<StudentFormState, FormData>(updateStudentAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="studentId" value={studentId} />
      <PersonFields state={state} initial={values} sensitive={sensitive} />
      <div>
        <SubmitButton pendingLabel="Saving…">Save student details</SubmitButton>
      </div>
    </form>
  );
}

export function PlacementForm({
  studentId,
  sectionId,
  options,
}: {
  studentId: string;
  sectionId: string | null;
  options: Option[];
}) {
  const [state, action] = useActionState<StudentFormState, FormData>(placeStudentAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="studentId" value={studentId} />
      <SelectField
        idPrefix="placement"
        name="sectionId"
        label="Class and section"
        options={options}
        placeholder="Not placed"
        defaultValue={sectionId ?? ""}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save placement</SubmitButton>
      </div>
    </form>
  );
}

export function StatusForm({ studentId, status }: { studentId: string; status: string }) {
  const [state, action] = useActionState<StudentFormState, FormData>(setStudentStatusAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="studentId" value={studentId} />
      <SelectField
        idPrefix="status"
        name="status"
        label="Enrolment status"
        options={STATUSES}
        defaultValue={status}
        hint="Withdrawn and graduated students keep their full record."
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save status</SubmitButton>
      </div>
    </form>
  );
}

export function GuardianForm({ studentId, sensitive }: { studentId: string; sensitive: boolean }) {
  const [state, action] = useActionState<StudentFormState, FormData>(addGuardianAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          idPrefix="guardian"
          name="fullName"
          label="Guardian name"
          defaultValue={valueOf(state, "fullName")}
          error={errors.fullName}
        />
        <TextField
          idPrefix="guardian"
          name="relationship"
          label="Relationship"
          defaultValue={valueOf(state, "relationship")}
          error={errors.relationship}
        />
      </div>
      {sensitive && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            idPrefix="guardian"
            name="phone"
            label="Phone"
            required={false}
            defaultValue={valueOf(state, "phone")}
            error={errors.phone}
          />
          <TextField
            idPrefix="guardian"
            name="email"
            label="Email"
            type="email"
            required={false}
            defaultValue={valueOf(state, "email")}
            error={errors.email}
          />
        </div>
      )}
      <div>
        <SubmitButton pendingLabel="Adding…">Add guardian</SubmitButton>
      </div>
    </form>
  );
}

export function TransferForm({
  studentId,
  branches,
  today,
}: {
  studentId: string;
  branches: Option[];
  today: string;
}) {
  const [state, action] = useActionState<StudentFormState, FormData>(transferStudentAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="studentId" value={studentId} />
      <SelectField
        idPrefix="transfer"
        name="toBranchId"
        label="New branch"
        options={branches}
        placeholder="Choose a branch"
        defaultValue={valueOf(state, "toBranchId")}
        error={errors.toBranchId}
      />
      <TextField
        idPrefix="transfer"
        name="effectiveOn"
        label="Effective from"
        type="date"
        defaultValue={valueOf(state, "effectiveOn", today)}
        error={errors.effectiveOn}
      />
      <TextField
        idPrefix="transfer"
        name="reason"
        label="Reason"
        required={false}
        defaultValue={valueOf(state, "reason")}
        error={errors.reason}
      />
      <p className="text-muted text-xs">
        The class placement ends, guardians move with the student, and the move is kept in the
        transfer history.
      </p>
      <div>
        <SubmitButton pendingLabel="Transferring…">Transfer student</SubmitButton>
      </div>
    </form>
  );
}

export function StudentPhotoForm({
  studentId,
  hasPhoto,
}: {
  studentId: string;
  hasPhoto: boolean;
}) {
  const [state, upload] = useActionState<StudentFormState, FormData>(uploadStudentPhotoAction, {});
  const [removeState, remove] = useActionState<StudentFormState, FormData>(
    removeStudentPhotoAction,
    {},
  );
  return (
    <div className="flex flex-col gap-3">
      <Feedback state={state.fieldErrors ? {} : state} />
      <Feedback state={removeState} />
      <form action={upload} className="flex flex-col gap-3">
        <input type="hidden" name="studentId" value={studentId} />
        <PhotoInput
          error={state.fieldErrors?.photo}
          hint="JPEG, PNG, or WebP up to 2 MB. It is cropped to a square."
        />
        <div>
          <SubmitButton pendingLabel="Uploading…">
            {hasPhoto ? "Replace photo" : "Upload photo"}
          </SubmitButton>
        </div>
      </form>
      {hasPhoto && (
        <form action={remove}>
          <input type="hidden" name="studentId" value={studentId} />
          <button type="submit" className="text-danger text-sm font-medium hover:underline">
            Remove photo
          </button>
        </form>
      )}
    </div>
  );
}
