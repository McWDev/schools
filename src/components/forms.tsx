"use client";

import { useFormStatus } from "react-dom";

interface TextFieldProps {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
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
}: TextFieldProps) {
  const id = `field-${name}`;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
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
        aria-describedby={describedBy || undefined}
        className="border-border bg-surface text-foreground placeholder:text-muted aria-invalid:border-danger h-10 rounded-md border px-3 text-sm shadow-xs"
      />
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
      className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-70"
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
      className={`rounded-md border px-3 py-2 text-sm ${styles}`}
    >
      <span className="font-semibold">{tone === "error" ? "Error: " : "Done: "}</span>
      {children}
    </div>
  );
}
