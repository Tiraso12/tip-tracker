import { memo } from "react";
import { fmtMoney } from "../shiftEditorUtils";

// Compact team tab for the horizontal switcher rail. One tap focuses that group's
// inputs in the single fixed-height panel below - the rail scrolls sideways on phone
// so the page height never grows with the roster.
//
// Painted toward the kit's plain underlined tab: a small status dot, the name, and -
// for the selected tab only - an underline. No box, no border, no fill at any width;
// a drawn pill/chip competed with the entry surface below for the same attention.
export const RailPill = memo(function RailPill({ group, selected, onSelect }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={onSelect}
            className={
                "relative flex-none inline-flex items-center gap-2 h-10 -mb-px px-1 max-[560px]:min-h-[44px] max-[560px]:px-2 " +
                "bg-transparent transition-colors duration-150 " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 rounded-[var(--radius-xs)]"
            }
        >
            <span
                className={
                    "h-[6px] w-[6px] rounded-full flex-none " +
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
            <span className={"text-[13px] font-medium whitespace-nowrap " + (selected ? "text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]")}>
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
            <span className={"font-mono tabular-nums whitespace-nowrap max-[560px]:hidden " + (selected ? "text-[12.5px] text-[var(--color-ink)]" : "text-[11.5px] text-[var(--color-ink-muted)]")}>
                {group.poolLabel === "Pay" ? "Pay " : ""}{selected ? fmtMoney(group.pool) : "$" + Math.round(group.pool).toLocaleString()}
            </span>
            {selected ? (
                <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--color-accent)]" />
            ) : null}
        </button>
    );
});
