import { ContractsDisclosure } from "./ContractsDisclosure";
import { PoolField } from "./PoolField";

// Money inputs for one dining team, plus the per-team contracts disclosure. Rendered
// inside the single entry panel (no card chrome of its own).
export function TeamPoolFields({
    team,
    date,
    onPoolChange,
    onToggleContracts,
    onAddContract,
    onUpdateContract,
    onRemoveContract,
}) {
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <PoolField label="Net revenue" value={team.pools.sales} onChange={(value) => onPoolChange(team.teamId, "sales", value)} />
                <PoolField label="Tips (CTP)" value={team.pools.tips} onChange={(value) => onPoolChange(team.teamId, "tips", value)} />
                <PoolField label="Gratuity" value={team.pools.gratuity} onChange={(value) => onPoolChange(team.teamId, "gratuity", value)} />
                <PoolField label="Cash" value={team.pools.cash} onChange={(value) => onPoolChange(team.teamId, "cash", value)} />
                <PoolField label="Covers" money={false} value={team.pools.covers} onChange={(value) => onPoolChange(team.teamId, "covers", value)} />
            </div>

            <ContractsDisclosure
                team={team}
                date={date}
                onToggleContracts={onToggleContracts}
                onAddContract={onAddContract}
                onUpdateContract={onUpdateContract}
                onRemoveContract={onRemoveContract}
            />
        </>
    );
}
