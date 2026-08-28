import { useState } from "react";
import { toMoney } from "../shiftEditorUtils";
import { roleLabel } from "../../../utils/roleLabels";
import { NUMERIC_INPUT } from "./numericInputClass";

function PointRow({ member, value, onPointChange, onPointAdjust }) {
    return (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-4 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col">
                <strong className="truncate text-sm text-[var(--color-ink)]">{member.name}</strong>
                <span className="text-[11px] text-[var(--color-ink-muted)]">{roleLabel(member.role)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onPointAdjust(member.uid, -0.5)}
                    aria-label={`Decrease ${member.name} points`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--color-line)] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]"
                >
                    −
                </button>
                <input
                    type="number"
                    min="0"
                    step="any"
                    className={NUMERIC_INPUT + " !h-11 !w-16 text-center"}
                    value={value}
                    onChange={(e) => onPointChange(member.uid, e.target.value)}
                    aria-label={`${member.name} points`}
                />
                <button
                    type="button"
                    onClick={() => onPointAdjust(member.uid, 0.5)}
                    aria-label={`Increase ${member.name} points`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--color-line)] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]"
                >
                    +
                </button>
            </div>
        </div>
    );
}

// Per-group point split. The trigger is the kit's dashed mint pill, carrying the live
// point total; tapping it opens the kit's bottom sheet rather than an inline expand -
// same shape as the Floor plan's employee-picker sheet (drag handle, rounded top,
// serif header) so the app has one sheet convention, not two. Today's fields, math,
// and save rules are unchanged - only how the split is reached and laid out moved.
export function PointSplitDisclosure({ title, members, defaultPoints = 0, emptyMessage, onPointChange, onPointAdjust }) {
    const [isOpen, setIsOpen] = useState(false);
    const totalPoints = members.reduce((sum, member) => {
        const points = member.points === null || member.points === undefined || member.points === ""
            ? defaultPoints
            : toMoney(member.points);
        return sum + points;
    }, 0);

    return (
        <div className="mt-1">
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-haspopup="dialog"
                className="flex w-full items-center justify-between gap-2.5 rounded-full border border-dashed border-[var(--color-accent)]/45 bg-[var(--color-accent-soft)] px-3.5 py-2.5 transition-colors hover:border-[var(--color-accent)]/70"
            >
                <span className="text-[13px] font-semibold text-[var(--color-accent)]">
                    Adjust point split · {members.length} {members.length === 1 ? "member" : "members"}
                </span>
                <span className="flex items-center gap-1 font-mono tabular-nums text-[12px] font-semibold text-[var(--color-accent)]">
                    {totalPoints.toLocaleString()} pts
                    <span aria-hidden="true">↑</span>
                </span>
            </button>

            {isOpen ? (
                <div className="fixed inset-0 z-50">
                    <button
                        type="button"
                        aria-label="Close point split"
                        className="absolute inset-0 bg-[var(--color-ink)]/30"
                        onClick={() => setIsOpen(false)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Point split for ${title}`}
                        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[75%] min-h-[16rem] max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-b-0 border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_-12px_36px_rgba(15,23,42,0.22)]"
                    >
                        <button
                            type="button"
                            aria-label="Close point split"
                            onClick={() => setIsOpen(false)}
                            className="mx-auto mt-2 h-5 w-12 flex-none rounded-full bg-transparent p-0"
                        >
                            <span className="mx-auto block h-1 w-9 rounded-full bg-[var(--color-line-strong)]" />
                        </button>
                        <div className="flex flex-none items-baseline justify-between gap-3 border-b border-[var(--color-line)] px-4 pb-3 pt-1">
                            <h3 className="m-0 min-w-0 truncate font-display text-[19px] font-medium text-[var(--color-ink)]">
                                {title} point split
                            </h3>
                            <strong className="flex-none font-mono tabular-nums text-[13px] text-[var(--color-ink)]">
                                {totalPoints.toLocaleString()} pts
                            </strong>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {members.length === 0 ? (
                                <p className="m-0 px-4 py-5 text-center text-sm text-[var(--color-ink-muted)]">
                                    {emptyMessage}
                                </p>
                            ) : members.map((member) => {
                                // Null/undefined means untouched - show the role default.
                                // "" means the admin just cleared the field to type a new
                                // number - show it blank, not the default, or every
                                // backspace snapped straight back to a number and typing
                                // a fresh value was never possible.
                                const value = member.points === null || member.points === undefined
                                    ? defaultPoints
                                    : member.points;
                                return (
                                    <PointRow
                                        key={member.uid}
                                        member={member}
                                        value={value}
                                        onPointChange={onPointChange}
                                        onPointAdjust={onPointAdjust}
                                    />
                                );
                            })}
                        </div>
                        <div className="flex flex-none items-center justify-end border-t border-[var(--color-line)] px-4 py-3">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
