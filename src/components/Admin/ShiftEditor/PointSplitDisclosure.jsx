import { useState } from "react";
import { toMoney } from "../shiftEditorUtils";
import { roleLabel } from "../../../utils/roleLabels";
import { NUMERIC_INPUT } from "./numericInputClass";

function PointGroup({ title, members, emptyMessage, defaultPoints = 0, onPointChange, onPointAdjust }) {
    const totalPoints = members.reduce((sum, member) => {
        const points = member.points === null || member.points === undefined || member.points === ""
            ? defaultPoints
            : toMoney(member.points);
        return sum + points;
    }, 0);

    return (
        <div className="border border-[var(--color-line)] rounded-[var(--radius-sm)] overflow-hidden max-[560px]:border-x-0 max-[560px]:rounded-none">
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-muted)]/40 border-b border-[var(--color-line)] max-[560px]:px-3 max-[560px]:py-2">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                    {title}
                </span>
                <strong className="text-xs font-mono tabular-nums text-[var(--color-ink)]">
                    {totalPoints.toLocaleString()} pts
                </strong>
            </div>

            {members.length === 0 ? (
                <div className="px-4 py-3 text-xs text-[var(--color-ink-muted)] italic">
                    {emptyMessage}
                </div>
            ) : (
                <div className="divide-y divide-[var(--color-line)]">
                    {members.map((member) => {
                        const value = member.points === null || member.points === undefined || member.points === ""
                            ? defaultPoints
                            : member.points;
                        return (
                            <div key={member.uid} className="flex items-center justify-between gap-3 px-4 py-2 max-[560px]:px-3 max-[560px]:py-2">
                                <div className="flex flex-col min-w-0 flex-1">
                                    <strong className="text-sm text-[var(--color-ink)] truncate max-[560px]:text-[0.82rem]">{member.name}</strong>
                                    <span className="text-[11px] text-[var(--color-ink-muted)] max-[560px]:text-[0.68rem]">
                                        {roleLabel(member.role)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 max-[560px]:gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => onPointAdjust(member.uid, -0.5)}
                                        aria-label={`Decrease ${member.name} points`}
                                        className="h-7 w-7 inline-flex items-center justify-center rounded-[var(--radius-xs)] border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors max-[560px]:h-11 max-[560px]:w-11"
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        className={NUMERIC_INPUT + " !w-16 !h-7 text-center max-[560px]:!h-11 max-[560px]:!w-16"}
                                        value={value}
                                        onChange={(e) => onPointChange(member.uid, e.target.value)}
                                        aria-label={`${member.name} points`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onPointAdjust(member.uid, 0.5)}
                                        aria-label={`Increase ${member.name} points`}
                                        className="h-7 w-7 inline-flex items-center justify-center rounded-[var(--radius-xs)] border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors max-[560px]:h-11 max-[560px]:w-11"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Per-group point split, folded into the entry panel as a calm collapsed disclosure so
// the panel height stays constant. Opening it reveals only the selected group's members.
export function PointSplitDisclosure({ title, members, defaultPoints = 0, emptyMessage, onPointChange, onPointAdjust }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="mt-3 border-t border-[var(--color-line)] pt-2.5">
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                aria-expanded={isOpen}
                className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors py-1"
            >
                <span className={"transition-transform duration-150 " + (isOpen ? "rotate-90" : "")}>▸</span>
                Adjust point split · {members.length} {members.length === 1 ? "member" : "members"}
            </button>
            {isOpen ? (
                <div className="mt-2">
                    <PointGroup
                        title={title}
                        members={members}
                        emptyMessage={emptyMessage}
                        defaultPoints={defaultPoints}
                        onPointChange={onPointChange}
                        onPointAdjust={onPointAdjust}
                    />
                </div>
            ) : null}
        </div>
    );
}
