import { NUMERIC_INPUT } from "./numericInputClass";
import { PoolField } from "./PoolField";

// Money inputs for one dining team, plus the per-team contracts disclosure. Rendered
// inside the single entry panel (no card chrome of its own).
export function TeamPoolFields({
    team,
    onPoolChange,
    onToggleContracts,
    onAddContract,
    onUpdateContract,
    onRemoveContract,
}) {
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <PoolField label="Sales" value={team.pools.sales} onChange={(value) => onPoolChange(team.teamId, "sales", value)} />
                <PoolField label="Tips (CTP)" value={team.pools.tips} onChange={(value) => onPoolChange(team.teamId, "tips", value)} />
                <PoolField label="Gratuity" value={team.pools.gratuity} onChange={(value) => onPoolChange(team.teamId, "gratuity", value)} />
                <PoolField label="Cash" value={team.pools.cash} onChange={(value) => onPoolChange(team.teamId, "cash", value)} />
                <PoolField label="Covers" money={false} value={team.pools.covers} onChange={(value) => onPoolChange(team.teamId, "covers", value)} />
            </div>

            <div className="mt-3 border-t border-[var(--color-line)]">
                <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <button
                        type="button"
                        onClick={() => onToggleContracts(team.teamId)}
                        aria-expanded={Boolean(team._showContracts)}
                        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors"
                    >
                        <span className={"transition-transform duration-150 " + (team._showContracts ? "rotate-90" : "")}>▶</span>
                        Contracts {team.contracts && team.contracts.length > 0 ? `(${team.contracts.length})` : ""}
                    </button>
                    {team._showContracts ? (
                        <button
                            type="button"
                            onClick={() => onAddContract(team.teamId)}
                            className="text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors whitespace-nowrap"
                        >
                            + Add Contract
                        </button>
                    ) : null}
                </div>

                {team._showContracts ? (
                    team.contracts && team.contracts.length > 0 ? (
                        <div className="pb-1 space-y-2">
                            {team.contracts.map((contract, contractIndex) => (
                                <div key={contractIndex} className="flex items-center gap-2">
                                    <span className="text-xs font-mono tabular-nums text-[var(--color-ink-muted)] w-7">
                                        #{contractIndex + 1}
                                    </span>
                                    <div className="relative flex-1">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-ink-muted)] pointer-events-none">$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="26% Gratuity Amount"
                                            value={contract.gratuity}
                                            onChange={(e) => onUpdateContract(team.teamId, contractIndex, "gratuity", e.target.value)}
                                            className={NUMERIC_INPUT + " !pl-6"}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onRemoveContract(team.teamId, contractIndex)}
                                        title="Remove contract"
                                        aria-label="Remove contract"
                                        className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors max-[560px]:h-11 max-[560px]:w-11"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="pb-1 text-xs text-[var(--color-ink-muted)] italic">
                            No contracts added. Click '+ Add Contract' to input a contract amount.
                        </div>
                    )
                ) : null}
            </div>
        </>
    );
}
