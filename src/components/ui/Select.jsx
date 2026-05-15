import React, { forwardRef } from "react";

const baseField =
  "block w-full h-10 pl-3 pr-9 text-sm bg-[var(--color-surface)] " +
  "text-[var(--color-ink)] " +
  "border border-[var(--color-line)] rounded-[var(--radius-sm)] " +
  "transition-colors duration-150 " +
  "hover:border-[var(--color-line-strong)] " +
  "focus:outline-none focus:border-[var(--color-accent)] " +
  "focus:ring-4 focus:ring-[var(--color-accent)]/15 " +
  "disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-ink-muted)] " +
  "disabled:cursor-not-allowed appearance-none";

const chevron =
  "bg-[length:14px_14px] bg-no-repeat bg-[right_0.75rem_center] " +
  "bg-[url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23525252' stroke-width='2'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3e%3c/svg%3e\")]";

const Select = forwardRef(function Select(
  { label, error, hint, className = "", id, children, ...props },
  ref
) {
  const inputId = id || props.name;
  const wrap = (
    <select
      ref={ref}
      id={inputId}
      className={
        baseField + " " + chevron +
        (error
          ? " border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/15"
          : "") +
        " " + className
      }
      {...props}
    >
      {children}
    </select>
  );

  if (!label && !error && !hint) return wrap;
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
      {wrap}
      {error ? (
        <span className="text-xs text-[var(--color-danger)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[var(--color-ink-muted)]">{hint}</span>
      ) : null}
    </div>
  );
});

export default Select;
