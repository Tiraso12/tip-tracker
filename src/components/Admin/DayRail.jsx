import { Fragment } from "react";

// Approach A - "The Day Rail".
// A slim, always-visible day-level step spine: ① Floor plan · ② Settle up ·
// ③ Review · Pay out. It orders the four big moments of the day; it does NOT
// re-step money entry (that stays the single calm switcher). Completed steps
// are always one tap away - status is shown, order is never hard-forced.
//
// Painted toward the kit's StepSpine: numbered pills connected by a line that
// fills in as steps complete, the active step as a solid dark pill, done as a
// filled check. Which tap goes where and when a step is reachable is untouched
// - only the paint changed.

function StateDot({ state, index }) {
    if (state === "done") {
        return (
            <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
        );
    }
    return (
        <span
            className={
                "inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-mono font-semibold tabular-nums " +
                (state === "active"
                    ? "bg-[var(--color-bar-ink-soft)] text-[var(--color-bar-bg)]"
                    : "border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]")
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
//
// `bleed` runs the rail edge-to-edge on a phone, past the page's own side
// padding, like the kit's full-width spine - the page padding otherwise reads
// as a margin around a floating card. Only true when the rail floats free
// (Floor, Settle): Review fuses the rail flush against its Card below, which
// does not bleed, so bleeding the rail there would misalign the two.
function DayRail({ steps, onStepClick, className = "", bleed = false }) {
    return (
        <nav
            aria-label="Day steps"
            className={
                "sticky top-14 z-10 flex items-center gap-1 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden "
                + (bleed ? "max-[560px]:-mx-4 max-[560px]:rounded-none max-[560px]:border-x-0 " : "")
                + className
            }
        >
            {steps.map((step, i) => {
                const clickable = step.clickable;
                const connectorFilled = step.state !== "pending";
                return (
                    <Fragment key={step.key}>
                        {i > 0 ? (
                            // Grows to bridge the gap between pills, like the kit's
                            // spine - not a fixed-width tick mark next to each pill.
                            <span
                                aria-hidden="true"
                                className={"mx-1.5 h-0.5 min-w-[12px] flex-1 rounded-full transition-colors " + (connectorFilled ? "bg-[var(--color-accent)]" : "bg-[var(--color-line)]")}
                            />
                        ) : null}
                        <button
                            type="button"
                            onClick={clickable ? () => onStepClick(step.key) : undefined}
                            disabled={!clickable}
                            aria-current={step.state === "active" ? "step" : undefined}
                            className={
                                "flex min-h-[44px] flex-none items-center gap-2 rounded-full pl-1 pr-2.5 transition-colors " +
                                (step.state === "active"
                                    ? "bg-[var(--color-bar-bg)] pr-3"
                                    : clickable
                                        ? "hover:bg-[var(--color-surface-muted)] cursor-pointer"
                                        : "cursor-default")
                            }
                        >
                            <StateDot state={step.state} index={step.index} />
                            <span
                                className={
                                    "truncate text-[13px] font-medium " +
                                    (step.state === "active"
                                        ? "text-[var(--color-bar-ink-soft)] font-semibold"
                                        : step.state === "done"
                                            ? "text-[var(--color-accent)]"
                                            : "text-[var(--color-ink-muted)]")
                                }
                            >
                                {step.label}
                            </span>
                        </button>
                    </Fragment>
                );
            })}
        </nav>
    );
}

export default DayRail;
