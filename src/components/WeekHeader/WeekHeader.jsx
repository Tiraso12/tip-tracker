import React from "react";

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

const toDateInputValue = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromDateInputValue = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const fromMonthInputValue = (value) => {
  if (!value) return null;
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
};

function WeekHeader({ startDate, endDate, onPrev, onNext, viewMode, onViewChange, currentDate, onDateChange }) {
  if (viewMode === "week" && (!startDate || !endDate)) return null;
  if (viewMode === "month" && !currentDate) return null;

  const pickerValue = viewMode === "month"
    ? toDateInputValue(currentDate).slice(0, 7)
    : toDateInputValue(startDate);

  const handlePickerChange = (event) => {
    const selectedDate = viewMode === "month"
      ? fromMonthInputValue(event.target.value)
      : fromDateInputValue(event.target.value);
    if (selectedDate) onDateChange(selectedDate);
  };

  return (
    <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-2">
        <NavButton onClick={onPrev} label="Previous">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </NavButton>
        <label className="min-h-9 min-w-[13rem] inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-2 text-left text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus-within:ring-2 focus-within:ring-[var(--color-accent)]/30">
            <input
              type={viewMode === "month" ? "month" : "date"}
              value={pickerValue}
              onChange={handlePickerChange}
              aria-label={viewMode === "month" ? "Select month" : "Select week date"}
              className="w-full bg-transparent p-0 font-mono text-base tabular-nums text-[var(--color-ink)] outline-none"
            />
        </label>
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
