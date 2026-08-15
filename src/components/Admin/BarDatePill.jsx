import React, { useRef } from "react";
import { formatMonthDay, getCurrentWeek, parseDateKey, stepDateKey, toDateKey } from "../../utils/dateUtils";

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
//
// PREV/NEXT FLANK THE PILL INSIDE THE SAME SHELL - one segmented control, still
// one date control. Stepping is the common move (last night, next payday); the
// calendar is for the day you have to go find. They share a border so the group
// still reads as the single thing the bar owns, and so the step targets cost only
// their own width rather than two more borders and two more gaps: at 320px the
// bar has ~200px for this control and the segmented shape fits in 186. The step
// UNIT is `unit`, the same word the label reads in - a day screen steps a day, a
// week screen steps one Friday-start work week (`stepDateKey`). Stepping is a
// plain state change and never opens the picker.
//
// A STEP MUST NOT RESIZE THE CONTROL. The thumb is still on the arrow when the
// label swaps, so a label that is wider in one state than the other slides the
// arrow out from under it mid-tap. That is why the week label reads "Week of ..."
// in every state and lets the tone carry which week is current - see the label
// below. THE DAY SIDE IS THE DELIBERATE EXCEPTION: "Today · Aug 15" is 16px wider
// than "Sun, Aug 16", so the day pill does move. The captain was shown both and
// chose to keep the word on 2026-08-15 - "Today" earns its width on the screen
// where money is entered against a night. Do not quietly make the two consistent.
//
// `readOnly` renders the same pill as a plain label. The shift editor mounts it
// that way: on a phone the editor's own header is `hidden sm:flex`, so the day
// you are typing money against was not on screen at all, while desktop showed it.
// The day has to be READABLE there and must not be CHANGEABLE mid-edit - swapping
// the date under a half-entered shift is the thing this pill exists to prevent.
//
// `unit="week"` is the same pill on the pay side, where the thing being read is
// a week rather than a night. It is the SAME control and not a second date
// picker: the bar owns the date, so the pay statement adds no date control of
// its own - the pill just relabels itself for the screen it is standing on. The
// two meanings never share a screen, which is what would make one pill dangerous
// on the screen where money is typed against a date. It is also why the read-only
// label carries NO step controls: prev/next must not become a back door around
// the one rule this pill exists to enforce.

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

function StepIcon({ direction }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points={direction === "prev" ? "15 6 9 12 15 18" : "9 6 15 12 9 18"} />
        </svg>
    );
}

function BarDatePill({ selectedDate, onSelectDate, readOnly = false, unit = "day" }) {
    const inputRef = useRef(null);
    const todayKey = toDateKey(new Date());
    const isWeek = unit === "week";
    const weekDates = isWeek ? getCurrentWeek(parseDateKey(selectedDate)) : null;
    const weekKeys = weekDates ? weekDates.map(toDateKey) : null;
    // "Current" is what turns the pill accent-green instead of warning-amber: the
    // day you are on, or the week you are in.
    const isToday = isWeek ? weekKeys.includes(todayKey) : selectedDate === todayKey;

    const monthDay = parseDateKey(selectedDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const weekday = parseDateKey(selectedDate).toLocaleDateString(undefined, { weekday: "short" });
    // The week label NEVER changes shape - "Week of <Friday>" whether or not that
    // week is the current one. It used to read "This week · ..." on the current
    // week, and stepping onto it made the whole control jump wider mid-tap, right
    // under the thumb that was still travelling. Currency is the TONE's job, which
    // is exactly what the tone already says; the word was saying it twice and
    // charging width for it. Screen readers get it back as a spoken suffix below,
    // so nothing about "which week is this" is colour-only.
    const pillLabel = isWeek
        ? `Week of ${formatMonthDay(weekDates[0])}`
        : (isToday ? `Today · ${monthDay}` : `${weekday}, ${monthDay}`);

    // Shared between the interactive control and the read-only label so the day
    // reads identically wherever it appears in the bar. The tone is the shell's,
    // not the label's, so the step buttons sit inside the same accent/warning skin.
    const toneClass = isToday
        ? "border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        : "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
    const shellClass =
        "relative inline-flex items-center gap-1.5 h-11 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors " +
        toneClass;

    if (readOnly) {
        const spokenDate = parseDateKey(selectedDate).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
        });
        return (
            // A plain span, not a button: nothing here can move the day. The abbreviated
            // label is the sighted read; the full sentence is what gets announced, so
            // "Mon, Jun 1" is never read as a bare fragment next to the controls.
            <span className={shellClass} data-testid="editor-day-label">
                <CalendarIcon />
                <span className="sr-only">{`Editing the shift for ${spokenDate}`}</span>
                <span aria-hidden="true" className="whitespace-nowrap">{pillLabel}</span>
            </span>
        );
    }

    // Open the OS date picker inside the tap gesture. WebKit exposes
    // showPicker() but can return without presenting a date picker, while the
    // input's native click does present it. Dispatch that click first, then
    // retain showPicker() for engines that require the explicit picker API.
    const openPicker = () => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.click();
        if (typeof el.showPicker === "function") {
            try {
                el.showPicker();
            } catch {
                // The native click has already attempted to present the picker.
            }
        }
    };

    const step = (direction) => onSelectDate(stepDateKey(selectedDate, unit, direction));

    // w-8 below sm is the 320px concession, and it is measured, not guessed: the
    // widest the control ever gets is the pay side's "Week of Aug 14" at 186px,
    // which at 320px leaves 14px clear of the home button. The 44px height keeps
    // the target comfortable in the direction the thumb travels down the bar; the
    // width is what the bar can actually pay for. rounded-full only on the outer
    // edge so the three segments read as one pill rather than three buttons in a
    // row.
    const stepClass =
        "h-11 w-8 sm:w-9 inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
        (isToday ? "hover:bg-[var(--color-accent)]/10" : "hover:bg-[var(--color-warning)]/10");

    return (
        <div
            className={
                "relative inline-flex items-center h-11 rounded-full border text-xs font-medium tabular-nums transition-colors " +
                toneClass
            }
        >
            {/* Native date control, overlaid behind the pill: it drives the OS
                picker and applies the choice immediately, but the pill stays
                the visible control. pointer-events-none so it cannot swallow a
                tap meant for the step buttons it sits under. */}
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
                onClick={() => step(-1)}
                aria-label={isWeek ? "Previous week" : "Previous day"}
                className={stepClass + " rounded-l-full"}
            >
                <StepIcon direction="prev" />
            </button>
            <button
                type="button"
                onClick={openPicker}
                aria-haspopup="dialog"
                aria-label={
                    isWeek
                        // "This week" survives here and nowhere else: the sighted read
                        // gets it from the accent tone, which costs no width.
                        ? `Pay week: ${pillLabel}${isToday ? " - this week" : ""}. Tap to change week.`
                        : `Shift date: ${pillLabel}. Tap to change day.`
                }
                className="h-11 inline-flex items-center gap-1.5 px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 rounded-full"
            >
                {/* The calendar glyph is now the only picker affordance - the
                    dropdown chevron that used to sit at the pill's right edge was
                    dropped when the step chevrons arrived: three chevrons in one
                    control read as ambiguous, and it was already the first thing
                    scheduled to go under 340px. */}
                <CalendarIcon />
                {/* nowrap: at 320px the label would otherwise wrap inside the
                    fixed-height pill and spill out of it. */}
                <span className="whitespace-nowrap">{pillLabel}</span>
            </button>
            <button
                type="button"
                onClick={() => step(1)}
                aria-label={isWeek ? "Next week" : "Next day"}
                className={stepClass + " rounded-r-full"}
            >
                <StepIcon direction="next" />
            </button>
        </div>
    );
}

export default BarDatePill;
