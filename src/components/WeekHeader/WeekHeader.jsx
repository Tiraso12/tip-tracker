import React from "react";
import { formatDate } from "../../utils/dateUtils";

function ToggleButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "px-3.5 py-1.5 text-xs font-medium tracking-tight rounded-[var(--radius-xs)] " +
        "transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
        (active
          ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
          : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]")
      }
    >
      {children}
    </button>
  );
}

function NavButton({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
    >
      {children}
    </button>
  );
}

function WeekHeader({ startDate, endDate, onPrev, onNext, viewMode, onViewChange, currentDate }) {
  if (viewMode === "week" && (!startDate || !endDate)) return null;
  if (viewMode === "month" && !currentDate) return null;

  const monthYear = viewMode === "month"
    ? currentDate.toLocaleString("default", { month: "long", year: "numeric" })
    : startDate.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-3">
        <NavButton onClick={onPrev} label="Previous">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </NavButton>
        <div className="min-w-[10rem]">
          <h2 className="font-display text-xl sm:text-2xl font-medium tracking-tight text-[var(--color-ink)] leading-none">
            {monthYear}
          </h2>
          {viewMode === "week" ? (
            <p className="mt-1 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
              {formatDate(startDate)} – {formatDate(endDate)}
            </p>
          ) : null}
        </div>
        <NavButton onClick={onNext} label="Next">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </NavButton>
      </div>

      <div
        role="group"
        aria-label="View mode"
        className="inline-flex items-center gap-1 p-1 bg-[var(--color-surface-muted)] border border-[var(--color-line)] rounded-[var(--radius-sm)] self-start sm:self-auto"
      >
        <ToggleButton active={viewMode === "week"} onClick={() => onViewChange("week")}>
          Week
        </ToggleButton>
        <ToggleButton active={viewMode === "month"} onClick={() => onViewChange("month")}>
          Month
        </ToggleButton>
      </div>
    </section>
  );
}

export default WeekHeader;
