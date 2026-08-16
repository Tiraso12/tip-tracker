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
    // The switcher pill above already carries the pool figure and the funded/needs-money
    // dot (visible at every width there), so this head does not repeat either - it names
    // the card and says what kind of number goes in it, on a phone as well as desktop.
    const moneyLabel = group.kind === "runners" ? "Take-home" : "Money in";

    return (
        <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden shadow-[0_1px_4px_rgba(15,23,42,0.04)]">
            <div className="flex items-baseline justify-between gap-3 px-4 py-3.5 border-b border-[var(--color-line)]">
                <span className="font-display text-[21px] tracking-tight text-[var(--color-ink)] truncate">
                    {group.name}
                </span>
                <span className="flex-none text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
                    {moneyLabel}
                </span>
            </div>
            <div className="p-4 max-[560px]:pt-3.5">
                {children}
            </div>
        </div>
    );
}
