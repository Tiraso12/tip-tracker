import { RUNNER_FLAT_RATE } from "../../../utils/constants";
import { fmtMoney } from "../shiftEditorUtils";
import { NUMERIC_INPUT } from "./numericInputClass";

export function RunnerGroup({ runners, totalPay, onPayoutChange }) {
    return (
        <div className="border border-[var(--color-line)] rounded-[var(--radius-sm)] overflow-hidden max-[560px]:border-x-0 max-[560px]:rounded-none">
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-muted)]/40 border-b border-[var(--color-line)] max-[560px]:px-3 max-[560px]:py-2">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                    Runners
                </span>
                <strong className="text-xs font-mono tabular-nums text-[var(--color-ink)]">
                    {fmtMoney(totalPay)}
                </strong>
            </div>

            {runners.length === 0 ? (
                <div className="px-4 py-3 text-xs text-[var(--color-ink-muted)] italic">
                    No runners assigned to this shift.
                </div>
            ) : (
                <div className="divide-y divide-[var(--color-line)]">
                    {runners.map((runner) => (
                        <div key={runner.uid} className="flex items-center justify-between gap-3 px-4 py-2 max-[560px]:px-3 max-[560px]:py-2">
                            <strong className="text-sm text-[var(--color-ink)] truncate max-[560px]:text-[0.82rem]">{runner.name}</strong>
                            <label className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">Payout</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className={NUMERIC_INPUT + " !w-20 !h-7 max-[560px]:!h-11 max-[560px]:!w-20"}
                                    value={runner.payoutAmount ?? ""}
                                    onChange={(e) => onPayoutChange(runner.uid, e.target.value)}
                                    placeholder={String(RUNNER_FLAT_RATE)}
                                    aria-label={`${runner.name} runner payout`}
                                />
                            </label>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
