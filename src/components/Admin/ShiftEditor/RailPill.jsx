import { memo } from "react";
import { fmtMoney } from "../shiftEditorUtils";

// Compact team pill for the horizontal switcher rail. One tap focuses that group's
// inputs in the single fixed-height panel below - the rail scrolls sideways on phone
// so the page height never grows with the roster.
export const RailPill = memo(function RailPill({ group, selected, onSelect }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={onSelect}
            className={
                "flex-none inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--radius-md)] border max-[560px]:min-h-[44px] " +
                // On a phone these are TABS, not pills: no box of their own, just a word
                // and its figure with the active one underlined. A drawn rectangle per
                // group competed with the entry surface below for the same attention, and
                // shape now separates the two navigations - the Day Rail's steps stay
                // boxed, the group switcher does not. ScrollRail's edge fade and "›" keep
                // off-screen groups discoverable, which is what a border used to hint at.
                "max-[560px]:rounded-none max-[560px]:border-transparent max-[560px]:bg-transparent max-[560px]:px-2.5 " +
                "transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                (selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[inset_0_-2px_0_var(--color-accent)] "
                      + "max-[560px]:bg-transparent max-[560px]:shadow-[inset_0_-3px_0_var(--color-accent)]"
                    : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-line-strong)]")
            }
        >
            <span className={"text-[13px] font-semibold whitespace-nowrap " + (selected ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]")}>
                {group.name}
            </span>
            {/* On a phone a tab is the team's NAME and nothing else. Carrying the pool
                here made every tab as wide as its figure, which is what pushed the third
                group off the edge, and a switcher is a place you choose from rather than
                a place you read money from. The figure needs a home of its own on the
                phone - until it has one it is not shown there at all.

                Desktop keeps it: the pills are not width-constrained there, and the
                selected one prints to the cent because a rounded pool on a screen with
                room for the real one is just a less useful number. */}
            <span className={"font-mono tabular-nums whitespace-nowrap max-[560px]:hidden " + (selected ? "text-[12.5px] text-[var(--color-accent)]" : "text-[11.5px] text-[var(--color-ink-soft)]")}>
                {group.poolLabel === "Pay" ? "Pay " : ""}{selected ? fmtMoney(group.pool) : "$" + Math.round(group.pool).toLocaleString()}
            </span>
            <span
                className={
                    "h-[7px] w-[7px] rounded-full flex-none " +
                    (group.status === "funded"
                        ? "bg-[var(--color-success)]"
                        : group.status === "sales-only"
                            ? "bg-[var(--color-warning)]"
                            : "bg-[var(--color-line-strong)]")
                }
                title={
                    group.status === "funded"
                        ? "Money in"
                        : group.status === "sales-only"
                            ? "Sales entered - tip pool still $0"
                            : "No money entered yet"
                }
                aria-hidden="true"
            />
        </button>
    );
});
