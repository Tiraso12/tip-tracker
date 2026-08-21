import React, { forwardRef } from "react";

const baseField =
  "block w-full h-10 px-3 text-base bg-[var(--color-surface)] " +
  "text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] " +
  "border border-[var(--color-line)] rounded-[var(--radius-sm)] " +
  "transition-colors duration-150 " +
  "hover:border-[var(--color-line-strong)] " +
  "focus:outline-none focus:border-[var(--color-accent)] " +
  "focus:ring-4 focus:ring-[var(--color-accent)]/15 " +
  "disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-ink-muted)] " +
  "disabled:cursor-not-allowed";

const errorField =
  "border-[var(--color-danger)] focus:border-[var(--color-danger)] " +
  "focus:ring-[var(--color-danger)]/15";

function Field({ label, error, hint, htmlFor, children }) {
  if (!label && !error && !hint) return children;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]"
        >
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="text-xs text-[var(--color-danger)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[var(--color-ink-muted)]">{hint}</span>
      ) : null}
    </div>
  );
}

const Input = forwardRef(function Input(
  { label, error, hint, className = "", id, type = "text", ...props },
  ref
) {
  const inputId = id || props.name;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        type={type}
        className={baseField + " " + (error ? errorField : "") + " " + className}
        {...props}
      />
    </Field>
  );
});

export default Input;
