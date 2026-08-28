import { formatContractRate } from "../../../utils/engine";
import { NUMERIC_INPUT } from "./numericInputClass";

function ContractRow({ contract, index, rateLabel, onUpdateContract, onRemoveContract }) {
    return (
        <div className="flex items-center gap-2 border-t border-[var(--color-line)] px-4 py-2.5">
            <span className="w-7 flex-none text-xs font-mono tabular-nums text-[var(--color-ink-muted)]">
                #{index + 1}
            </span>
            <div className="relative flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-ink-muted)]">$</span>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`${rateLabel} Gratuity Amount`}
                    value={contract.gratuity}
                    onChange={(e) => onUpdateContract(index, "gratuity", e.target.value)}
                    className={NUMERIC_INPUT + " !pl-6"}
                />
            </div>
            <button
                type="button"
                onClick={() => onRemoveContract(index)}
                title="Remove contract"
                aria-label={`Remove contract ${index + 1}`}
                className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
            >
                ×
            </button>
        </div>
    );
}

// Per-team contracts. The trigger is the same dashed mint pill as the point split's
// (carrying the live contract count instead of a point total), opening the same kit
// bottom sheet rather than an inline expand - one sheet convention across Settle up,
// not an expand here and a sheet there. Today's fields, math, and save rules are
// unchanged; only how the contracts list is reached and laid out moved. Open/closed
// state is still the team's own `_showContracts` flag (transient, UI-only, excluded
// from the change fingerprint) - the sheet just renders from it instead of an inline
// block, so no state plumbing changed.
export function ContractsDisclosure({ team, date, onToggleContracts, onAddContract, onUpdateContract, onRemoveContract }) {
    const isOpen = Boolean(team._showContracts);
    // The rate this shift's contracts are actually divided by - the engine keys it on
    // the shift date, so an old night reopened for an edit must not prompt for today's.
    const rateLabel = formatContractRate(date);
    const contracts = team.contracts ?? [];
    const close = () => onToggleContracts(team.teamId);

    return (
        <div className="mt-3">
            <button
                type="button"
                onClick={() => onToggleContracts(team.teamId)}
                aria-haspopup="dialog"
                className="flex w-full items-center justify-between gap-2.5 rounded-full border border-dashed border-[var(--color-accent)]/45 bg-[var(--color-accent-soft)] px-3.5 py-2.5 transition-colors hover:border-[var(--color-accent)]/70"
            >
                <span className="text-[13px] font-semibold text-[var(--color-accent)]">
                    Contracts {contracts.length > 0 ? `· ${contracts.length}` : ""}
                </span>
                <span className="flex items-center gap-1 font-mono tabular-nums text-[12px] font-semibold text-[var(--color-accent)]">
                    {contracts.length}
                    <span aria-hidden="true">↑</span>
                </span>
            </button>

            {isOpen ? (
                <div className="fixed inset-0 z-50">
                    <button
                        type="button"
                        aria-label="Close contracts"
                        className="absolute inset-0 bg-[var(--color-ink)]/30"
                        onClick={close}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Team contracts"
                        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[75%] min-h-[16rem] max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-b-0 border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_-12px_36px_rgba(15,23,42,0.22)]"
                    >
                        <button
                            type="button"
                            aria-label="Close contracts"
                            onClick={close}
                            className="mx-auto mt-2 h-5 w-12 flex-none rounded-full bg-transparent p-0"
                        >
                            <span className="mx-auto block h-1 w-9 rounded-full bg-[var(--color-line-strong)]" />
                        </button>
                        <div className="flex flex-none items-baseline justify-between gap-3 border-b border-[var(--color-line)] px-4 pb-3 pt-1">
                            <h3 className="m-0 min-w-0 truncate font-display text-[19px] font-medium text-[var(--color-ink)]">
                                Contracts
                            </h3>
                            <button
                                type="button"
                                onClick={() => onAddContract(team.teamId)}
                                className="flex-none text-[13px] font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
                            >
                                + Add Contract
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {contracts.length === 0 ? (
                                <p className="m-0 px-4 py-5 text-center text-sm text-[var(--color-ink-muted)]">
                                    No contracts added. Tap "+ Add Contract" to input a contract amount.
                                </p>
                            ) : contracts.map((contract, index) => (
                                <ContractRow
                                    key={index}
                                    contract={contract}
                                    index={index}
                                    rateLabel={rateLabel}
                                    onUpdateContract={(i, field, value) => onUpdateContract(team.teamId, i, field, value)}
                                    onRemoveContract={(i) => onRemoveContract(team.teamId, i)}
                                />
                            ))}
                        </div>
                        <div className="flex flex-none items-center justify-end border-t border-[var(--color-line)] px-4 py-3">
                            <button
                                type="button"
                                onClick={close}
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
