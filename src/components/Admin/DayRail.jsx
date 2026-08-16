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
function DayRail({ steps, onStepClick, className = "" }) {
    return (
        <nav
            aria-label="Day steps"
            className={
                "sticky top-14 z-10 flex items-center gap-1.5 bg-[var(--color-bg)] py-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden "
                + className
            }
        >
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
                                "inline-flex min-h-[32px] items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-[13px] transition-colors " +
                                (step.state === "active"
                                    ? "font-semibold text-[var(--color-ink)]"
                                    : step.state === "done"
                                        ? "text-[var(--color-accent)] " + (clickable ? "hover:underline cursor-pointer" : "")
                                        : "text-[var(--color-ink-muted)]")
                            }
                        >
                            {step.state === "done" ? (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            ) : null}
                            {step.label}
                        </button>
                    </span>
                );
            })}
        </nav>
    );
}

export default DayRail;
