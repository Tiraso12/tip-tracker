import React from "react";

const TONES = {
  neutral:
    "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)] border-[var(--color-line)]",
  accent:
    "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/15",
  success:
    "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20",
  warning:
    "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20",
  danger:
    "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20",
};

export default function Badge({
  tone = "neutral",
  className = "",
  children,
  ...props
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] " +
        "font-medium uppercase tracking-wide rounded-full border " +
        TONES[tone] + " " + className
      }
      {...props}
    >
      {children}
    </span>
  );
}
