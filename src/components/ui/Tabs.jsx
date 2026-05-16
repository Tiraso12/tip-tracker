import React from "react";

export default function Tabs({
  items,
  value,
  onChange,
  className = "",
  ariaLabel = "Tabs",
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={
        "flex items-center gap-6 border-b border-[var(--color-line)] " +
        className
      }
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(item.value)}
            className={
              "relative -mb-px py-3 text-sm font-medium tracking-tight " +
              "transition-colors duration-150 focus:outline-none " +
              "focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 rounded-sm " +
              (active
                ? "text-[var(--color-ink)] " +
                  "after:absolute after:left-0 after:right-0 after:-bottom-px " +
                  "after:h-[2px] after:bg-[var(--color-accent)] after:rounded-full"
                : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]")
            }
          >
            {item.label}
            {item.badge != null ? (
              <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-mono tabular-nums rounded-full bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
