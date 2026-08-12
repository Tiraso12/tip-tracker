import React from "react";

const VARIANTS = {
  primary:
    "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] " +
    "focus-visible:ring-[var(--color-accent)]/30 disabled:bg-[var(--color-ink-muted)]",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] " +
    "hover:bg-[var(--color-surface-muted)] hover:border-[var(--color-line-strong)] " +
    "focus-visible:ring-[var(--color-accent)]/20 disabled:text-[var(--color-ink-muted)]",
  ghost:
    "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)] " +
    "focus-visible:ring-[var(--color-accent)]/20 disabled:text-[var(--color-ink-muted)]",
  danger:
    "bg-[var(--color-danger)] text-white hover:bg-[#991b1b] " +
    "focus-visible:ring-[var(--color-danger)]/30 disabled:bg-[var(--color-ink-muted)]",
};

const SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={
        // Buttons are fixed-height, so a wrapped label always spills out of the
        // box - keep labels on one line and let the layout deal with the width.
        "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] " +
        "font-medium tracking-tight transition-colors duration-150 " +
        "focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed " +
        VARIANTS[variant] + " " + SIZES[size] + " " + className
      }
      {...props}
    >
      {children}
    </button>
  );
}
