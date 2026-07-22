import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import styles from "./FormField.module.css";

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}

/** Wraps a single form control, wiring label/hint/error association via `useId` (spec 7.4 a11y baseline). */
export function FormField({ label, hint, error, children }: FormFieldProps): ReactNode {
  const inputId = useId();
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const extraProps: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean } = { id: inputId };
  if (describedBy !== undefined) extraProps["aria-describedby"] = describedBy;
  if (error) extraProps["aria-invalid"] = true;

  const control = isValidElement(children) ? cloneElement(children, extraProps) : children;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      {control}
      {hint && !error && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
