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
export function CloseoutEntryPanel({ group, children }) {
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
            <div className="p-4 max-[560px]:pt-3.5">
                {children}
            </div>
        </div>
    );
}
