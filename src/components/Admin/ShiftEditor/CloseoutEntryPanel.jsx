import { fmtMoney } from "../shiftEditorUtils";

// The single entry panel. Its chrome (head + padded body) is identical for every
// group - only the fields inside change per selected group. Body content is supplied
// by the caller.
//
// The panel HUGS its own content, at every width: it grows to fit Sales through the
// point-split trigger and stops there, rather than stretching to fill the screen with
// an internal scroller. The page scrolls if the card runs past the viewport - the
// floating Edit/Cancel/Done pair is `fixed`, so it stays reachable regardless.
//
// This is the ONLY frame around the selected group's money, at every width - Settle up
// floats on the page background with no outer editor Card, same as Floor's TeamCard, so
// the border/shadow weight below matches Floor's exactly rather than the heavier lift a
// double-nested panel used to need.
// Direction A's mark-done control (2026-08-23 lock): a "Save and Mark Done"
// button in the entry panel header, not a checklist dot - see
// data/tip-tracker-parallel-settle-ui-a/report.md. Disabled while the group
// is still "on tables" (nothing meaningful entered) - there is nothing to
// call final yet. Once done, the button itself becomes the affirmative
// state (green, checked, inert); the only way to undo it is editing a field,
// which silently clears the mark (plan Q9) and surfaces the quiet cue below
// rather than requiring a second tap here.
function MarkDoneControl({ group, onMarkDone, showUnmarkedCue }) {
    if (group.kind === "runners") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
                <span aria-hidden="true">✓</span>
                Always marked done
            </span>
        );
    }

    const isDone = group.status === "done";
    const canMark = isDone || group.status === "entering";

    return (
        <span className="inline-flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={() => onMarkDone(group.id)}
                disabled={!canMark || isDone}
                title={!canMark ? "Enter this group's money before marking it done" : undefined}
                className={
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed " +
                    (isDone
                        ? "bg-[var(--color-success-soft)] text-[var(--color-success)] disabled:opacity-100"
                        : "bg-[var(--color-accent)] text-white disabled:opacity-40 hover:opacity-90")
                }
            >
                {isDone ? (
                    <>
                        <span aria-hidden="true">✓</span>
                        Marked done
                    </>
                ) : (
                    "Save and Mark Done"
                )}
            </button>
            {showUnmarkedCue ? (
                <span role="status" className="text-[11.5px] leading-snug text-[var(--color-warning)]">
                    ⚠ Marked done cleared - this group was edited after being marked done
                </span>
            ) : null}
        </span>
    );
}

export function CloseoutEntryPanel({ group, children, onMarkDone, showUnmarkedCue = false, hideMarkControl = false }) {
    // Titled money card: serif group name left, muted "Money in" / "Take-home" right.
    // The switcher pill above already carries the funded/needs-money dot (visible at
    // every width there), so this head does not repeat that - it names the card and
    // says what kind of number goes in it, on desktop.
    //
    // On a phone the name + label are replaced by one pill carrying what the figure
    // IS (CTP + GRT, or Take-home for runners) and its exact amount to the cent - the
    // switcher tab above already names the group, so the pill does not repeat it.
    // Styled like the kit's existing status pills (see the funded/needs-money pills
    // in SettleStep) rather than inventing new chrome for it.
    const moneyLabel = group.kind === "runners" ? "Take-home" : "Money in";
    const exactPool = fmtMoney(group.pool);
    // The dining/bar pool is CTP + GRT (contract gratuity included - it is still
    // gratuity, just entered through a different field), the same "CTP + GRT" the
    // rest of the app uses for a payout total (see DayPayoutPanel's "Total (CTP+GRT)").
    // Runner pay isn't that - it is a flat payout drawn OUT of the pool - so it keeps
    // the "Take-home" word instead of implying it is charged tip plus gratuity.
    const pillDescriptor = group.kind === "runners" ? "Take-home" : "CTP + GRT";

    return (
        <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden shadow-[0_1px_4px_rgba(15,23,42,0.04)]">
            <div className="flex items-baseline justify-between gap-3 px-4 py-3.5 border-b border-[var(--color-line)]">
                <span className="font-display text-[21px] tracking-tight text-[var(--color-ink)] truncate max-[560px]:hidden">
                    {group.name}
                </span>
                <span className="flex-none text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)] max-[560px]:hidden">
                    {moneyLabel}
                </span>
                <span className="hidden max-[560px]:inline-flex items-center gap-1.5 min-w-0 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
                    <span className="truncate">{pillDescriptor}</span>
                    <strong className="flex-none font-mono tabular-nums">{exactPool}</strong>
                </span>
            </div>
            {/* Direction A's Save and Mark Done row - suppressed on a closed shift
                (`hideMarkControl`), where this group's done-state no longer gates
                anything and edits persist only through Review -> Confirm & Save. */}
            {hideMarkControl ? null : (
                <div className="px-4 py-2.5 border-b border-[var(--color-line)] bg-[var(--color-surface-muted)]">
                    <MarkDoneControl group={group} onMarkDone={onMarkDone} showUnmarkedCue={showUnmarkedCue} />
                </div>
            )}
            <div className="p-4 max-[560px]:pt-3.5">
                {children}
            </div>
        </div>
    );
}
