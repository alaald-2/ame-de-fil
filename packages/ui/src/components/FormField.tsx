import { useId, type ReactNode } from "react";
import { Label } from "./Label";

interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (fieldProps: FieldControlProps) => ReactNode;
}

// WCAG 2.2 AA / DESIGN_SYSTEM.md §7: every form control gets a
// programmatically associated label and, on error, an aria-describedby link
// to the message — not just visual proximity. Render-prop so any control
// (Input, Textarea, a future Select) can receive the wired-up id/aria attrs.
export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className="text-sm text-neutral-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
