"use client";

import { useState } from "react";

export interface RoleOption {
  id: string;
  name: string;
  description: string;
}
export interface BranchOption {
  id: string;
  name: string;
  code: string;
}

/** Role checkboxes. Only roles the server says the actor may grant are offered. */
export function RoleFields({
  roles,
  selected = [],
  error,
}: {
  roles: RoleOption[];
  selected?: string[];
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? "roles-error" : undefined}>
      <legend className="mb-1 text-sm font-medium">Roles</legend>
      {roles.map((role) => (
        <label
          key={role.id}
          className="border-border hover:bg-surface-muted flex items-start gap-3 rounded-md border p-3 text-sm"
        >
          <input
            type="checkbox"
            name="roleIds"
            value={role.id}
            defaultChecked={selected.includes(role.id)}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">{role.name}</span>
            <span className="text-muted block text-xs">{role.description}</span>
          </span>
        </label>
      ))}
      {error && (
        <p id="roles-error" className="text-danger text-xs font-medium">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Whole-school vs. specific-branch access. */
export function AccessFields({
  branches,
  canGrantSchoolScope,
  scope = "branch",
  selectedBranches = [],
  error,
}: {
  branches: BranchOption[];
  canGrantSchoolScope: boolean;
  scope?: "school" | "branch";
  selectedBranches?: string[];
  error?: string;
}) {
  const [current, setCurrent] = useState<"school" | "branch">(
    canGrantSchoolScope ? scope : "branch",
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Branch access</legend>
      {canGrantSchoolScope && (
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value="school"
              checked={current === "school"}
              onChange={() => setCurrent("school")}
            />
            All branches of the school
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value="branch"
              checked={current === "branch"}
              onChange={() => setCurrent("branch")}
            />
            Specific branches only
          </label>
        </div>
      )}
      {!canGrantSchoolScope && <input type="hidden" name="scope" value="branch" />}
      {current === "branch" && (
        <div
          className="grid gap-2 sm:grid-cols-2"
          aria-describedby={error ? "branches-error" : undefined}
        >
          {branches.map((branch) => (
            <label
              key={branch.id}
              className="border-border hover:bg-surface-muted flex items-center gap-3 rounded-md border p-3 text-sm"
            >
              <input
                type="checkbox"
                name="branchIds"
                value={branch.id}
                defaultChecked={selectedBranches.includes(branch.id)}
              />
              <span>
                {branch.name} <span className="text-muted text-xs">({branch.code})</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {error && (
        <p id="branches-error" className="text-danger text-xs font-medium">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Shown when the server asks for a fresh password confirmation. */
export function ConfirmPasswordField({ error }: { error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="currentPassword" className="text-sm font-medium">
        Your password
      </label>
      <input
        id="currentPassword"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        aria-invalid={error ? true : undefined}
        aria-describedby="currentPassword-hint"
        className="border-border bg-surface aria-invalid:border-danger h-10 max-w-sm rounded-md border px-3 text-sm"
      />
      <p
        id="currentPassword-hint"
        className={error ? "text-danger text-xs font-medium" : "text-muted text-xs"}
      >
        {error ?? "Required for changes to access. You won't be asked again for 10 minutes."}
      </p>
    </div>
  );
}
