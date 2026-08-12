// Approach A - "The Day Rail".
// A slim, always-visible day-level step spine: ① Floor plan · ② Settle up ·
// ③ Review · Pay out. It orders the four big moments of the day; it does NOT
// re-step money entry (that stays the single calm switcher). Completed steps
// are always one tap away - status is shown, order is never hard-forced.

function StateDot({ state, index }) {
    if (state === "done") {
        return (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
        );
    }
    if (state === "end") {
        return (
            <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] rotate-45 border border-[var(--color-line-strong)]"
                aria-hidden="true"
            />
        );
    }
    return (
        <span
            className={
                "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums " +
                (state === "active"
                    ? "bg-[var(--color-accent)] text-white"
                    : "border border-[var(--color-line-strong)] text-[var(--color-ink-muted)]")
            }
            aria-hidden="true"
        >
            {index}
        </span>
    );
}

// The rail is the navigation the admin actually uses mid-shift, so it stays on
// screen: pinned directly under the h-14 app bar (sticky top-14) instead of
// scrolling away while money is being entered. z-10 keeps it beneath the app
// bar's z-40 and above page content.
function DayRail({ steps, onStepClick }) {
    return (
        <nav
            aria-label="Day steps"
            className="sticky top-14 z-10 flex items-stretch gap-1.5 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
            {steps.map((step) => {
                const clickable = step.clickable;
                return (
                    <button
                        key={step.key}
                        type="button"
                        onClick={clickable ? () => onStepClick(step.key) : undefined}
                        disabled={!clickable}
                        aria-current={step.state === "active" ? "step" : undefined}
                        className={
                            "flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-2 text-left transition-colors sm:justify-start sm:px-2.5 " +
                            (step.state === "active"
                                ? "bg-[var(--color-accent-soft)] "
                                : clickable
                                    ? "hover:bg-[var(--color-surface-muted)] cursor-pointer "
                                    : "cursor-default ")
                        }
                    >
                        <StateDot state={step.state} index={step.index} />
                        <span className="flex min-w-0 flex-col leading-tight">
                            <span
                                className={
                                    "truncate text-[11px] font-medium sm:text-[12px] " +
                                    (step.state === "active"
                                        ? "text-[var(--color-accent)]"
                                        : step.state === "pending" || step.state === "end"
                                            ? "text-[var(--color-ink-muted)]"
                                            : "text-[var(--color-ink)]")
                                }
                            >
                                {step.label}
                            </span>
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

export default DayRail;
