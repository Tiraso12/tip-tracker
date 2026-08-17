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
                "relative flex-none inline-flex items-start h-10 -mb-px px-1 max-[560px]:min-h-[44px] max-[560px]:px-2 " +
                "bg-transparent transition-colors duration-150 " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 rounded-[var(--radius-xs)]"
            }
        >
            {/* The tap target stays a full 44px tall on phone (h-10 on desktop) for a
                comfortable thumb hit area, but `items-start` on the button pins the
                visible dot+name+figure to its TOP edge instead of centering them in
                that height - so the row you actually see sits right under the day
                rail above it, and the leftover height (still fully tappable) falls
                below the text instead of padding it out on both sides. */}
            <span className="inline-flex items-center gap-2">
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
                <span className={"relative inline-block text-[14.5px] font-medium whitespace-nowrap " + (selected ? "text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]")}>
                    {group.name}
                    {/* Scoped to just the name, not the whole tab (dot + desktop $ figure
                        included) - a full-width underline read as centered under the tab
                        as a whole rather than under the word you'd actually read to tell
                        which team is selected. */}
                    {selected ? (
                        <span aria-hidden="true" className="absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-[var(--color-accent)]" />
                    ) : null}
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
            </span>
        </button>
    );
});
