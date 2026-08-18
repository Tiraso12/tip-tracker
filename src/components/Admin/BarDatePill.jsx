import React, { useRef } from "react";
import { formatWeekRange, getCurrentWeek, parseDateKey, stepDateKey, toDateKey } from "../../utils/dateUtils";

// The "Bar Date" - the Shifts-tab date lives in the top app bar as a compact
// reading pill so the content area opens flush with the Day Rail. Tapping the
// pill opens the browser's own date picker directly (one natural action; the day
// changes as soon as a date is chosen - no confirm step). A single tap only ever
// OPENS the OS picker, a deliberate modal, so it can never move the day by
// itself; dismissing it without choosing leaves the day unchanged. Off today the
// pill's border turns warning-amber; getting back to today is the app bar's home
// control, which resets the day AND the screen. A separate "Today" return pill
// used to sit here doing the same thing in a smaller target, and the two
// together overflowed the bar at 320px, so the pill now reads the day and
// nothing else.
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
// A STEP MUST NOT RESIZE THE CONTROL was the rule this pill shipped under: the
// thumb is still on the arrow when the label swaps, so a label wider in one
// state than another slides the arrow out from under it mid-tap. It is why the
// week label used to read "Week of ..." in every state, constant width, tone
// alone saying which week is current - and why the day side reading "Today ·
// Aug 15" and jumping 16px on every step was a KEPT, deliberate exception as of
// 2026-08-15.
//
// On 2026-08-16 the real Pullenberg kit turned up (Shared.jsx / PayScreen.jsx /
// FloorReviewScreens.jsx) and neither of its labels is either of ours: the day
// pill is plain "Sat, Aug 15", never "Today", and the week pill is a compact
// range, "Aug 10 - 16" (en dash, month named once), never "Week of ...". Kit
// wins over both of this file's own conventions (see AGENTS.md's kit-authority
// note) - the captain called the kit's transparent/outline shell over the old
// filled chip, and the kit's week range over "Week of", both on 2026-08-16.
// `formatWeekRange` builds that range and falls back to naming the month on
// both ends ("Aug 28 - Sep 3") for a week that crosses a boundary, a case the
// kit's own screens never show - the only unambiguous option once both ends
// need it. THIS BRINGS THE RESIZE BACK: unlike "Week of", the range's width
// depends on the days themselves, so it holds steady across a run of same-
// month weeks ("Aug 14 - 20" to "Aug 21 - 27") but visibly changes on the one
// week a month boundary falls in - the exact defect this file's day-pill fix
// was written to remove, now reintroduced on the week side on purpose because
// the kit's own form does it. Flagged, not silently reintroduced: watch how
// that reads against the flanking arrows on the week that crosses a boundary.
//
// Because the kit never had to depict "today" in a live, steppable control
// either, the tone still has to ride the border (mint when current, warning-
// amber otherwise) or the shell goes back to being colour-blind about which
// day/week this is, on the one screen it is not allowed to be. The calendar
// icon and the prev/next chevrons all read the same `--color-bar-mint` - the
// kit's own mint-400 - so the three glyphs read as one set regardless of that
// border tone.
//
// The pill is 36px tall (`h-9`), the kit's own KitDatePill height. 44px is
// this app's usual comfortable phone thumb-target, not a floor every control
// must hit - the Pullenberg kit wins where it specifies a control's own size,
// and it specifies 36px here. The captain chose that on 2026-08-16 with the
// smaller target in view; this is the kit-wins principle applying, not a
// one-off exception to keep re-litigating.
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

// `--color-bar-ink` / `--color-bar-mint` are tuned to read against the dark
// app bar (`--color-bar-bg`) - correct for the bar's own date pill, but
// invisible where `unit="week"` embeds this same control in a light card
// (Team's person view pay history, PayView's "My pay"): near-white text on
// the page's near-white surface. `surface="card"` swaps in the light-page
// equivalents (`--color-ink`, `--color-accent`) instead of re-theming the bar.
function iconTone(surface) {
    return surface === "card" ? "text-[var(--color-accent)]" : "text-[var(--color-bar-mint)]";
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

function StepIcon({ direction }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points={direction === "prev" ? "15 6 9 12 15 18" : "9 6 15 12 9 18"} />
        </svg>
    );
}

function BarDatePill({ selectedDate, onSelectDate, readOnly = false, unit = "day", surface = "bar" }) {
    const inputRef = useRef(null);
    const iconToneClass = iconTone(surface);
    const todayKey = toDateKey(new Date());
    const isWeek = unit === "week";
    const weekDates = isWeek ? getCurrentWeek(parseDateKey(selectedDate)) : null;
    const weekKeys = weekDates ? weekDates.map(toDateKey) : null;
    // "Current" is what turns the pill's border mint instead of warning-amber:
    // the day you are on, or the week you are in.
    const isToday = isWeek ? weekKeys.includes(todayKey) : selectedDate === todayKey;

    const monthDay = parseDateKey(selectedDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const weekday = parseDateKey(selectedDate).toLocaleDateString(undefined, { weekday: "short" });
    // Neither label changes shape for "today" - "<range>" and "<Weekday>, <Mon
    // D>" read the same whether or not that day/week is the current one.
    // Currency is the TONE's job (below). The week label DOES still change
    // shape between weeks, on purpose - see the kit-range paragraph above.
    // Screen readers get the day back too, via the read-only span's spoken
    // sentence and the week button's aria-label.
    const pillLabel = isWeek ? formatWeekRange(weekDates[0], weekDates[6]) : `${weekday}, ${monthDay}`;

    // Shared between the interactive control and the read-only label so the day
    // reads identically wherever it appears. The kit's transparent, thin-border
    // shell: bg-transparent always, and only the border carries which day/week
    // this is. Text and the "current" border both switch with `surface` - the
    // bar's near-white ink and bright mint would be invisible on a light card.
    // Every branch is a complete literal class string (not built from an
    // interpolated variable) because Tailwind's build-time scanner can only
    // find arbitrary-value classes it can read whole out of the source.
    const toneClass = surface === "card"
        ? (isToday
            ? "border-[var(--color-accent)]/60 bg-transparent text-[var(--color-ink)]"
            : "border-[var(--color-warning)]/50 bg-transparent text-[var(--color-ink)]")
        : (isToday
            ? "border-[var(--color-bar-mint)]/60 bg-transparent text-[var(--color-bar-ink)]"
            : "border-[var(--color-warning)]/50 bg-transparent text-[var(--color-bar-ink)]");
    const shellClass =
        "relative inline-flex items-center gap-1.5 h-9 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors " +
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
                <span className={iconToneClass}>
                    <CalendarIcon />
                </span>
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

    // w-8 below sm is the 320px concession, measured against the pay side's old
    // "Week of Aug 14" at 186px, the widest state that label ever reached - the
    // kit's range form replacing it (see above) is a different, narrower shape
    // and needs its own re-measure rather than trusting that number. rounded-full
    // only on the outer edge so the three segments read as one pill rather than
    // three buttons in a row.
    const stepClass =
        "h-9 w-8 sm:w-9 inline-flex items-center justify-center " + iconToneClass + " transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
        (isToday ? "hover:bg-[var(--color-accent)]/10" : "hover:bg-[var(--color-warning)]/10");

    return (
        <div
            className={
                "relative inline-flex items-center h-9 rounded-full border text-xs font-medium tabular-nums transition-colors " +
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
                        // gets it from the border tone, which costs no width.
                        ? `Pay week: ${pillLabel}${isToday ? " - this week" : ""}. Tap to change week.`
                        : `Shift date: ${pillLabel}. Tap to change day.`
                }
                className="h-9 inline-flex items-center gap-1.5 px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 rounded-full"
            >
                {/* The calendar glyph is now the only picker affordance - the
                    dropdown chevron that used to sit at the pill's right edge was
                    dropped when the step chevrons arrived: three chevrons in one
                    control read as ambiguous, and it was already the first thing
                    scheduled to go under 340px. */}
                <span className={iconToneClass}>
                    <CalendarIcon />
                </span>
                {/* nowrap: at 320px the label would otherwise wrap inside the
                    fixed-height pill and spill out of it. The week range's
                    width depends on the days themselves (a single-digit day
                    like "Aug 7" is narrower than "Aug 14", and a month
                    boundary repeats the month name entirely - "Aug 28 – Sep
                    3"), so without a reserved width the whole pill resized on
                    every step, sliding the flanking arrows with it. min-w
                    fits the widest case (a cross-month range) so the control
                    holds one width regardless of which week is showing - the
                    same "a step must not resize the control" rule the day
                    pill already ships under, just a wider reservation for a
                    label that swings further. */}
                <span className={"whitespace-nowrap" + (isWeek ? " inline-block min-w-[92px]" : "")}>{pillLabel}</span>
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
