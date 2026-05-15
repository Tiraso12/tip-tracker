import React, { forwardRef } from "react";

const baseField =
  "block w-full px-3 py-2 text-sm bg-[var(--color-surface)] " +
  "text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] " +
  "border border-[var(--color-line)] rounded-[var(--radius-sm)] " +
  "transition-colors duration-150 " +
  "hover:border-[var(--color-line-strong)] " +
  "focus:outline-none focus:border-[var(--color-accent)] " +
  "focus:ring-4 focus:ring-[var(--color-accent)]/15 " +
  "disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-ink-muted)] " +
  "disabled:cursor-not-allowed resize-y min-h-[5rem]";

const Textarea = forwardRef(function Textarea(
  { label, error, hint, className = "", id, ...props },
  ref
) {
  const inputId = id || props.name;
  const field = (
    <textarea
      ref={ref}
      id={inputId}
      className={
        baseField +
        (error
          ? " border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/15"
          : "") +
        " " + className
      }
      {...props}
    />
  );

  if (!label && !error && !hint) return field;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]"
        >
          {label}
        </label>
      ) : null}
      {field}
      {error ? (
        <span className="text-xs text-[var(--color-danger)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[var(--color-ink-muted)]">{hint}</span>
      ) : null}
    </div>
  );
});

export default Textarea;
