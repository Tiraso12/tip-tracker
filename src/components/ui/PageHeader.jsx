import React from "react";

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className = "",
}) {
  return (
    <header
      className={
        "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 " +
        "pb-6 mb-6 border-b border-[var(--color-line)] " +
        className
      }
    >
      <div className="flex flex-col gap-1.5">
        {eyebrow ? (
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-[var(--color-ink)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-[var(--color-ink-soft)] max-w-2xl">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
