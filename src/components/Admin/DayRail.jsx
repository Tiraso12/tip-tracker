import { getNextStep } from "../../utils/dayFlow";

// The day-level step trail: Floor plan › Settle up › Review. It orders the
// three big moments of the day; it does NOT re-step money entry (that stays
// the single calm switcher). Completed steps are always one tap away - status
// is shown, order is never hard-forced.
//
// Painted as a plain chevron-separated breadcrumb rather than a bordered
// pill-spine card. The day-chip strip above already owns a boxed, bordered
// row for "which day" - stacking a second card of near-identical weight
// directly under it for "which step" (once a team is assigned, in the
// editor's Floor step, the two sit on screen together) read as two competing
// navs. Compared live against an underline-tab direction and a collapsed
// progress-bar direction on 2026-08-16; the captain picked this one. Which
// tap goes where and when a step is reachable is untouched - only the paint
// changed.
//
// The rail stays on screen while money is being entered: pinned directly
// under the h-14 app bar (sticky top-14) instead of scrolling away. z-10
// keeps it beneath the app bar's z-40 and above page content.
//
// The Next button is derived, never a parallel step list: it reads the
// active step off `steps` and asks `getNextStep` (dayFlow.js) where forward
// goes, then only shows if that step's own `clickable` flag (from
// `getRailSteps`) already says it's reachable. So Next can never sneak past
// a gate the breadcrumb itself would refuse - Floor stays gateless until
// staff are assigned, Review is gateless once inside the editor, and on
// Review there is no next step, so the button disappears rather than going
// inert. Kept outside the breadcrumbs' own overflow-x-auto scroller so it
// can't be scrolled out of reach on a narrow phone.
//
// Optional `onBack` is the editor's way out to this day's landing (who's-left
// list). It lives here, leading the trail, because a lone chevron on its own
// row above the rail read as leftover chrome, the page header that could host
// it is hidden on a phone, and the app bar's home control jumps to TODAY not
// this date. A hairline keeps it from reading as "previous step" opposite Next.
function DayRail({ steps, onStepClick, onBack, className = "" }) {
    const activeKey = steps.find((step) => step.state === "active")?.key ?? null;
    const nextStep = activeKey ? steps.find((step) => step.key === getNextStep(activeKey)) : null;
    const canAdvance = Boolean(nextStep?.clickable);

    return (
        <nav
            aria-label="Day steps"
            className={
                "sticky top-14 z-10 flex items-center gap-2 bg-[var(--color-bg)] py-0 "
                + className
            }
        >
            {onBack ? (
                <>
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label="Back"
                        className="inline-flex flex-none min-h-[32px] min-w-[32px] items-center justify-center -ml-1.5 text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="15 6 9 12 15 18" />
                        </svg>
                    </button>
                    <span aria-hidden="true" className="h-3 w-px flex-none bg-[var(--color-line)]" />
                </>
            ) : null}
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {steps.map((step, i) => {
                    const clickable = step.clickable;
                    return (
                        <span key={step.key} className="flex flex-none items-center gap-1.5">
                            {i > 0 ? <span aria-hidden="true" className="text-xs text-[var(--color-ink-muted)]">›</span> : null}
                            <button
                                type="button"
                                onClick={clickable ? () => onStepClick(step.key) : undefined}
                                disabled={!clickable}
                                aria-current={step.state === "active" ? "step" : undefined}
                                className={
                                    "inline-flex min-h-[32px] items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-[13px] font-semibold transition-colors " +
                                    (step.state === "active"
                                        ? "text-[var(--color-ink)]"
                                        : step.state === "done"
                                            ? "text-[var(--color-accent)] " + (clickable ? "hover:underline cursor-pointer" : "")
                                            : "text-[var(--color-ink-muted)]")
                                }
                            >
                                {/* The checkmark's own slot is always in the DOM at a fixed
                                    size, visibility toggled rather than the element added or
                                    removed - so a step flipping to "done" (e.g. Floor plan
                                    once you step forward to Settle up) can't nudge every pill
                                    after it sideways. Font weight is uniform across every
                                    state for the same reason: only colour changes state now,
                                    never glyph metrics, so the whole trail holds still while
                                    you move through it instead of visibly reflowing. */}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={step.state === "done" ? "opacity-100" : "opacity-0"}>
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                {step.label}
                            </button>
                        </span>
                    );
                })}
            </div>
            {canAdvance ? (
                <button
                    type="button"
                    onClick={() => onStepClick(nextStep.key)}
                    className="inline-flex flex-none h-6 items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bar-bg)] px-5 text-xs font-medium tracking-tight text-[var(--color-bar-mint)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-bar-mint)]/30"
                >
                    Next
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 6 15 12 9 18" />
                    </svg>
                </button>
            ) : null}
        </nav>
    );
}

export default DayRail;
