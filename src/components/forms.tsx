"use client";

import { useFormStatus } from "react-dom";

import { buttonClass } from "@/components/ui";

interface TextFieldProps {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "date" | "number";
  autoComplete?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  /** Distinguishes fields with the same name in different forms on one page. */
  idPrefix?: string;
}

const controlClass =
  "border-border bg-surface text-foreground placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-primary/20 aria-invalid:border-danger aria-invalid:focus:ring-danger/20 h-10 rounded-lg border px-3 text-sm shadow-xs transition-colors outline-none focus:ring-4";

function FieldMessages({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-danger text-xs font-medium">
          {error}
        </p>
      )}
    </>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}

export function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  error,
  hint,
  required = true,
  defaultValue,
  idPrefix,
}: TextFieldProps) {
  const id = `field-${idPrefix ? `${idPrefix}-` : ""}${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={controlClass}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  error,
  hint,
  defaultValue,
  idPrefix,
  placeholder,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  hint?: string;
  defaultValue?: string;
  idPrefix?: string;
  /** First, empty option, e.g. "Choose a grade". */
  placeholder?: string;
}) {
  const id = `field-${idPrefix ? `${idPrefix}-` : ""}${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={controlClass}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={buttonClass("primary")}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success"; children: string }) {
  const styles =
    tone === "error"
      ? "border-danger/30 bg-danger-surface text-danger"
      : "border-success/30 bg-success-surface text-success";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2.5 text-sm ${styles}`}
    >
      <span className="font-semibold">{tone === "error" ? "Error: " : "Done: "}</span>
      {children}
    </div>
  );
}
