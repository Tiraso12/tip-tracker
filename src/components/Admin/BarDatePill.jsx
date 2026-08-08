import React, { useEffect, useRef, useState } from "react";
import { toDateKey } from "../../utils/dateUtils";

// The "Bar Date" - the Shifts-tab date lives in the top app bar as a compact,
// non-tappable reading pill so the content area opens flush with the Day Rail.
// A single tap only OPENS the picker popover; it never moves the day by itself.
// Off today the pill turns warning-amber and a one-tap return-to-today appears,
// so drift is visible and instantly reversible.

function parseKey(dateKey) {
    return new Date(dateKey + "T12:00:00");
}

function CalendarIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    );
}

function BarDatePill({ selectedDate, onSelectDate, onChangeDate }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const todayKey = toDateKey(new Date());
    const isToday = selectedDate === todayKey;

    useEffect(() => {
        if (!open) return undefined;
        const onDocClick = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const monthDay = parseKey(selectedDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const weekday = parseKey(selectedDate).toLocaleDateString(undefined, { weekday: "short" });
    const pillLabel = isToday ? `Today · ${monthDay}` : `${weekday}, ${monthDay}`;

    const goToday = () => {
        onSelectDate(todayKey);
        setOpen(false);
    };

    return (
        <div ref={rootRef} className="relative flex items-center gap-1.5">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`Shift date: ${pillLabel}. Tap to change day.`}
                className={
                    "inline-flex items-center gap-1.5 h-9 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                    (isToday
                        ? "border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:border-[var(--color-accent)]/30"
                        : "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning)] hover:border-[var(--color-warning)]/50")
                }
            >
                <CalendarIcon />
                <span>{pillLabel}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={"transition-transform " + (open ? "rotate-180" : "")}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {!isToday ? (
                <button
                    type="button"
                    onClick={goToday}
                    aria-label="Return to today"
                    title="Return to today"
                    className="inline-flex items-center gap-1 h-9 rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-2.5 text-xs font-medium text-[var(--color-warning)] transition-colors hover:border-[var(--color-warning)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-warning)]/30"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 14 4 9 9 4" />
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                    </svg>
                    Today
                </button>
            ) : null}

            {open ? (
                <div
                    role="dialog"
                    aria-label="Choose shift date"
                    className="absolute right-0 top-full z-30 mt-2 w-[248px] rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2 shadow-[0_12px_28px_-12px_rgba(10,10,10,0.35)]"
                >
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => onChangeDate(-1)}
                            aria-label="Previous day"
                            title="Previous day"
                            className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        </button>
                        <input
                            type="date"
                            value={selectedDate}
                            aria-label="Select shift date"
                            onChange={(e) => onSelectDate(e.target.value)}
                            className="h-11 min-w-0 flex-1 px-2 text-sm font-mono tabular-nums bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] rounded-[var(--radius-sm)] hover:border-[var(--color-line-strong)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/15 transition-colors"
                        />
                        <button
                            type="button"
                            onClick={() => onChangeDate(1)}
                            aria-label="Next day"
                            title="Next day"
                            className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={goToday}
                            disabled={isToday}
                            className="h-11 flex-1 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 disabled:text-[var(--color-ink-muted)] disabled:cursor-not-allowed disabled:hover:bg-[var(--color-surface)]"
                        >
                            Jump to today
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="h-11 inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)]/30"
                        >
                            Done
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default BarDatePill;
