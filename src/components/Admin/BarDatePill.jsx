import React, { useRef } from "react";
import { toDateKey } from "../../utils/dateUtils";

// The "Bar Date" - the Shifts-tab date lives in the top app bar as a compact
// reading pill so the content area opens flush with the Day Rail. Tapping the
// pill opens the browser's own date picker directly (one natural action; the day
// changes as soon as a date is chosen - no confirm step). A single tap only ever
// OPENS the OS picker, a deliberate modal, so it can never move the day by
// itself; dismissing it without choosing leaves the day unchanged. Off today the
// pill turns warning-amber; getting back to today is the app bar's home control,
// which resets the day AND the screen. A separate "Today" return pill used to sit
// here doing the same thing in a smaller target, and the two together overflowed
// the bar at 320px, so the pill now reads the day and nothing else.

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

function BarDatePill({ selectedDate, onSelectDate }) {
    const inputRef = useRef(null);
    const todayKey = toDateKey(new Date());
    const isToday = selectedDate === todayKey;

    const monthDay = parseKey(selectedDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const weekday = parseKey(selectedDate).toLocaleDateString(undefined, { weekday: "short" });
    const pillLabel = isToday ? `Today · ${monthDay}` : `${weekday}, ${monthDay}`;

    // Open the OS date picker on tap. showPicker() must run inside the tap
    // gesture; fall back to focus+click for browsers without it.
    const openPicker = () => {
        const el = inputRef.current;
        if (!el) return;
        if (typeof el.showPicker === "function") {
            try {
                el.showPicker();
                return;
            } catch {
                // fall through to the focus/click fallback
            }
        }
        el.focus();
        el.click();
    };

    return (
        <div className="relative inline-flex">
            {/* Native date control, overlaid behind the pill: it drives the OS
                picker and applies the choice immediately, but the pill stays
                the visible control. */}
            <input
                ref={inputRef}
                type="date"
                value={selectedDate}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                    if (e.target.value) onSelectDate(e.target.value);
                }}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
            />
            <button
                type="button"
                onClick={openPicker}
                aria-haspopup="dialog"
                aria-label={`Shift date: ${pillLabel}. Tap to change day.`}
                className={
                    "relative inline-flex items-center gap-1.5 h-9 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                    (isToday
                        ? "border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:border-[var(--color-accent)]/30"
                        : "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning)] hover:border-[var(--color-warning)]/50")
                }
            >
                <CalendarIcon />
                {/* nowrap: at 320px the label would otherwise wrap inside the
                    h-9 pill and spill out of it. */}
                <span className="whitespace-nowrap">{pillLabel}</span>
                {/* The picker chevron is the first thing to go on the narrowest
                    phones - the day itself must never be the control that shrinks. */}
                <svg className="max-[340px]:hidden" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
        </div>
    );
}

export default BarDatePill;
