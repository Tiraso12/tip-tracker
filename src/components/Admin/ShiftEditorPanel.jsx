import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { calculateShift } from "../../utils/engine";
import ShiftSetupDnd from "./ShiftSetup/ShiftSetupDnd";
import { Button, Card } from "../ui";
import { buildClosedShiftPayload, buildShiftSetupDraft, getRemovedPayoutUids } from "../../utils/shiftPersistence";
import { RUNNER_FLAT_RATE } from "../../utils/constants";
import { getHistoryFlagUpdate, getShiftParticipantUids } from "../../utils/userHistoryFlags";

const toMoney = (value) => Number(value) || 0;
const hasNegative = (value) => Number(value) < 0;
const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtMoney = (value) => moneyFormatter.format(toMoney(value));
const getPayoutNonCashTotal = (payout = {}) =>
    toMoney(payout.tips ?? payout.ctp ?? payout.payoutAmount) + toMoney(payout.gratuity ?? payout.grt);
const roleLabels = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

const ignoreMissingUserDoc = (error) => {
    if (error?.code !== "not-found") {
        throw error;
    }
};

function getContractTotal(team) {
    return (team.contracts || []).reduce((sum, contract) => sum + toMoney(contract.gratuity), 0);
}

function getTeamSummary(team) {
    const pools = team.pools || {};
    const contractTotal = getContractTotal(team);
    const tips = toMoney(pools.tips);
    const gratuity = toMoney(pools.gratuity);
    const cash = toMoney(pools.cash);

    return {
        sales: toMoney(pools.sales),
        tips,
        gratuity,
        cash,
        covers: toMoney(pools.covers),
        contractTotal,
        payoutPool: tips + gratuity + cash + contractTotal,
    };
}

function getBarSummary(barTeam) {
    const pools = barTeam.pools || {};
    const tips = toMoney(pools.tips);
    const gratuity = toMoney(pools.gratuity);

    return {
        sales: toMoney(pools.sales),
        tips,
        gratuity,
        covers: toMoney(pools.covers),
        runnerTransfer: toMoney(pools.runners),
        payoutPool: tips + gratuity,
    };
}

function validateShiftInputs({ teams, barTeam, runners }) {
    const errors = [];
    const assignedCount = teams.reduce((sum, team) => sum + team.members.length, 0)
        + barTeam.members.length
        + runners.length;

    if (assignedCount === 0) {
        errors.push("Assign at least one employee before saving the shift.");
    }

    let enteredMoney = 0;

    teams.forEach((team, index) => {
        const label = `Team ${index + 1}`;
        const pools = team.pools || {};
        ["sales", "tips", "gratuity", "cash"].forEach((field) => {
            if (hasNegative(pools[field])) errors.push(`${label} ${field} cannot be negative.`);
            enteredMoney += toMoney(pools[field]);
        });

        (team.contracts || []).forEach((contract, contractIndex) => {
            if (contract.gratuity === "" || contract.gratuity === null || contract.gratuity === undefined) {
                errors.push(`${label} contract #${contractIndex + 1} needs a gratuity amount or should be removed.`);
            }
            if (hasNegative(contract.gratuity)) {
                errors.push(`${label} contract #${contractIndex + 1} cannot be negative.`);
            }
            enteredMoney += toMoney(contract.gratuity);
        });
    });

    const barPools = barTeam.pools || {};
    ["sales", "tips", "gratuity", "runners"].forEach((field) => {
        if (hasNegative(barPools[field])) errors.push(`Bar ${field} cannot be negative.`);
        enteredMoney += toMoney(barPools[field]);
    });

    runners.forEach((runner) => {
        if (hasNegative(runner.payoutAmount)) {
            errors.push(`Runner ${runner.name || "Unknown"} payout cannot be negative.`);
        }
    });

    if (enteredMoney <= 0) {
        errors.push("Enter at least one sales, tip, gratuity, cash, contract, or bar amount before saving.");
    }

    return errors;
}

function getAssignedCount({ teams, barTeam, runners }) {
    return teams.reduce((sum, team) => sum + team.members.length, 0)
        + barTeam.members.length
        + runners.length;
}

function validateTeamSetup({ teams, barTeam, runners }) {
    if (getAssignedCount({ teams, barTeam, runners }) === 0) {
        return ["Assign at least one employee before saving the team setup."];
    }

    return [];
}

function mapPayoutsForFirebase(result) {
    const mappedPayoutsForFirebase = {};

    const attachToMapped = (arr, globalRole) => {
        if (!arr) return;
        arr.forEach(p => {
            mappedPayoutsForFirebase[p.uid] = {
                name: p.name,
                role: p.role || globalRole,
                points: p.points || 0,
                tips: p.ctp !== undefined ? p.ctp : (p.payoutAmount || 0),
                gratuity: p.grt || 0,
                cash: p.cash || 0,
                wineBonus: 0,
                total: p.total !== undefined ? p.total : (p.payoutAmount || 0)
            };
        });
    };

    if (result.payouts?.roleGrouped) {
        attachToMapped(result.payouts.roleGrouped.captains, 'captain');
        attachToMapped(result.payouts.roleGrouped.servers, 'server');
        attachToMapped(result.payouts.roleGrouped.backs, 'back');
        attachToMapped(result.payouts.roleGrouped.assistants, 'assistant');
        attachToMapped(result.payouts.roleGrouped.bar, 'bartender');
        attachToMapped(result.payouts.roleGrouped.runners, 'runner');
    }

    return mappedPayoutsForFirebase;
}

function buildPayoutReview(result, mappedPayouts) {
    const payoutRows = Object.entries(mappedPayouts)
        .map(([uid, payout]) => ({ uid, ...payout }))
        .sort((a, b) => {
            const roleOrder = ["captain", "server", "back", "assistant", "bartender", "runner"];
            const roleDiff = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
            if (roleDiff !== 0) return roleDiff;
            return (a.name || "").localeCompare(b.name || "");
        });

    return {
        result,
        mappedPayouts,
        payoutRows,
        staffTotal: payoutRows.reduce((sum, payout) => sum + getPayoutNonCashTotal(payout), 0),
    };
}

const NUMERIC_INPUT =
    "block w-full h-9 px-2.5 text-sm font-mono tabular-nums bg-[var(--color-surface)] max-[560px]:h-11 " +
    "text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] " +
    "border border-[var(--color-line)] rounded-[var(--radius-xs)] " +
    "transition-colors duration-150 hover:border-[var(--color-line-strong)] " +
    "focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 " +
    "appearance-none [-moz-appearance:textfield] " +
    "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function PoolField({ label, value, onChange, hint }) {
    const id = `pool-field-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                {label}
            </label>
            {hint ? <span className="text-[10px] text-[var(--color-ink-muted)]">{hint}</span> : null}
            <input
                id={id}
                type="number"
                min="0"
                step="0.01"
                className={NUMERIC_INPUT}
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder="0.00"
                aria-label={label}
            />
        </div>
    );
}

function SummaryMetric({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                {label}
            </span>
            <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)] truncate">
                {value}
            </strong>
        </div>
    );
}

function PoolCardTotals({ totals }) {
    return (
        <div className="grid grid-cols-3 gap-3 px-4 py-3 bg-[var(--color-surface-muted)]/50 border-y border-[var(--color-line)] max-[560px]:gap-2">
            {totals.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                        {label}
                    </span>
                    <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)] truncate">
                        {label === "Covers" ? value.toLocaleString() : fmtMoney(value)}
                    </strong>
                </div>
            ))}
        </div>
    );
}

function TeamCloseoutCard({
    title,
    memberCount,
    totals,
    hasInputData,
    children,
}) {
    const [showInputs, setShowInputs] = useState(hasInputData);

    return (
        <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line)]">
                <span className="text-sm font-medium text-[var(--color-ink)]">
                    {title} ({memberCount} {memberCount === 1 ? "member" : "members"})
                </span>
                <button
                    type="button"
                    onClick={() => setShowInputs(open => !open)}
                    className="hidden max-[560px]:inline text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
                >
                    {showInputs ? "Hide inputs" : hasInputData ? "Edit inputs" : "Edit inputs"}
                </button>
            </div>
            <PoolCardTotals totals={totals} />
            <div className={(showInputs ? "grid " : "grid max-[560px]:hidden ") + "grid-cols-1 sm:grid-cols-3 gap-3 p-4"}>
                {children}
            </div>
        </div>
    );
}

const TeamPoolCloseoutCard = memo(function TeamPoolCloseoutCard({
    team,
    teamIndex,
    summarySales,
    summaryPool,
    summaryCovers,
    onPoolChange,
    onToggleContracts,
    onAddContract,
    onUpdateContract,
    onRemoveContract,
}) {
    const hasInputData = Object.values(team.pools || {}).some(value => toMoney(value) > 0)
        || (team.contracts || []).some(contract => toMoney(contract.gratuity) > 0);

    return (
        <TeamCloseoutCard
            title={`Team ${teamIndex + 1}`}
            memberCount={team.members.length}
            hasInputData={hasInputData}
            totals={[
                ["Sales", summarySales],
                ["Pool", summaryPool],
                ["Covers", summaryCovers],
            ]}
        >
            <PoolField label="Sales ($)" value={team.pools.sales} onChange={(value) => onPoolChange(team.teamId, "sales", value)} />
            <PoolField label="Tips (CTP) ($)" value={team.pools.tips} onChange={(value) => onPoolChange(team.teamId, "tips", value)} />
            <PoolField label="Gratuity ($)" value={team.pools.gratuity} onChange={(value) => onPoolChange(team.teamId, "gratuity", value)} />
            <PoolField label="Cash ($)" value={team.pools.cash} onChange={(value) => onPoolChange(team.teamId, "cash", value)} />
            <PoolField label="Covers" value={team.pools.covers} onChange={(value) => onPoolChange(team.teamId, "covers", value)} />

            <div className="col-span-full border-t border-[var(--color-line)]">
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
                        <div className="pb-4 space-y-2">
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
                                        className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="pb-4 text-xs text-[var(--color-ink-muted)] italic">
                            No contracts added. Click '+ Add Contract' to input a contract amount.
                        </div>
                    )
                ) : null}
            </div>
        </TeamCloseoutCard>
    );
});

const BarPoolCloseoutCard = memo(function BarPoolCloseoutCard({
    barTeam,
    summarySales,
    summaryPool,
    summaryTransfer,
    hasInputData,
    onBarPoolChange,
}) {
    return (
        <TeamCloseoutCard
            title="Bar Team"
            memberCount={barTeam.members.length}
            hasInputData={hasInputData || barTeam.members.length > 0}
            totals={[
                ["Sales", summarySales],
                ["Pool", summaryPool],
                ["Transfer", summaryTransfer],
            ]}
        >
            <PoolField label="Bar Sales ($)" value={barTeam.pools.sales} onChange={(value) => onBarPoolChange("sales", value)} />
            <PoolField label="Tips (CTP) ($)" value={barTeam.pools.tips} onChange={(value) => onBarPoolChange("tips", value)} />
            <PoolField label="Gratuity ($)" value={barTeam.pools.gratuity} onChange={(value) => onBarPoolChange("gratuity", value)} />
            <PoolField label="Covers" value={barTeam.pools.covers} onChange={(value) => onBarPoolChange("covers", value)} />
            <PoolField label="Runners Transfer ($)" value={barTeam.pools.runners} onChange={(value) => onBarPoolChange("runners", value)} />
        </TeamCloseoutCard>
    );
});

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
                                        {roleLabels[member.role] || member.role || "Staff"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 max-[560px]:gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => onPointAdjust(member.uid, -0.5)}
                                        aria-label={`Decrease ${member.name} points`}
                                        className="h-7 w-7 inline-flex items-center justify-center rounded-[var(--radius-xs)] border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors max-[560px]:h-8 max-[560px]:w-8"
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        className={NUMERIC_INPUT + " !w-16 !h-7 text-center max-[560px]:!h-8 max-[560px]:!w-16 max-[560px]:text-[0.82rem]"}
                                        value={value}
                                        onChange={(e) => onPointChange(member.uid, e.target.value)}
                                        aria-label={`${member.name} points`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onPointAdjust(member.uid, 0.5)}
                                        aria-label={`Increase ${member.name} points`}
                                        className="h-7 w-7 inline-flex items-center justify-center rounded-[var(--radius-xs)] border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors max-[560px]:h-8 max-[560px]:w-8"
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

function RunnerGroup({ runners, totalPay, onPayoutChange }) {
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
                                    className={NUMERIC_INPUT + " !w-20 !h-7 max-[560px]:!h-8 max-[560px]:!w-20 max-[560px]:text-[0.82rem]"}
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

function PointAdjustmentsPanel({
    teams,
    barTeam,
    runners,
    totals,
    onTeamPointChange,
    onTeamPointAdjust,
    onBarPointChange,
    onBarPointAdjust,
    onRunnerPayoutChange,
}) {
    const restaurantMembersCount = teams.reduce((sum, team) => sum + team.members.length, 0);
    const hasAdjustments = restaurantMembersCount > 0 || barTeam.members.length > 0 || runners.length > 0;
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line)] max-[560px]:items-start">
                <div className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--color-ink)]">Point Adjustments</span>
                    <div className="mt-2 flex items-center gap-2 text-xs font-mono tabular-nums text-[var(--color-ink-soft)] max-[560px]:flex-wrap">
                        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-1">Dining {totals.restaurant.toLocaleString()} pts</span>
                        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-1">Bar {totals.bar.toLocaleString()} pts</span>
                        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-1">Runners {fmtMoney(totals.runnerPay)}</span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsOpen(open => !open)}
                    className="shrink-0 text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
                >
                    {isOpen ? "Hide points" : "Edit points"}
                </button>
            </div>

            {!isOpen ? null : !hasAdjustments ? (
                <div className="px-4 py-6 text-xs text-[var(--color-ink-muted)] italic">
                    Assign restaurant, bar, or runner employees before adjusting.
                </div>
            ) : (
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3 max-[560px]:px-0 max-[560px]:py-2">
                    {teams.map((team, index) => (
                        <PointGroup
                            key={team.teamId}
                            title={`Team ${index + 1}`}
                            members={team.members}
                            emptyMessage="No dining room employees on this team."
                            onPointChange={(uid, value) => onTeamPointChange(team.teamId, uid, value)}
                            onPointAdjust={(uid, delta) => onTeamPointAdjust(team.teamId, uid, delta)}
                        />
                    ))}

                    <PointGroup
                        title="Bar Team"
                        members={barTeam.members}
                        emptyMessage="No bar employees assigned."
                        defaultPoints={1}
                        onPointChange={onBarPointChange}
                        onPointAdjust={onBarPointAdjust}
                    />

                    <RunnerGroup
                        runners={runners}
                        totalPay={totals.runnerPay}
                        onPayoutChange={onRunnerPayoutChange}
                    />
                </div>
            )}
        </div>
    );
}

function CalculatedPayoutReview({ review }) {
    const { result, payoutRows, staffTotal } = review;
    const reviewRoleLabels = {
        captain: "Captains",
        server: "Servers",
        back: "Backs",
        assistant: "Assistants",
        bartender: "Bar",
        runner: "Runners",
    };

    return (
        <div className="border border-[var(--color-accent)]/20 rounded-[var(--radius-md)] bg-[var(--color-accent-soft)]/40">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-[var(--color-accent)]/20">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Calculated payout review
                    </div>
                    <div className="font-display text-2xl font-medium tracking-tight tabular-nums text-[var(--color-accent)]">
                        {fmtMoney(staffTotal)}
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">Balance</span>
                    <strong className="font-mono tabular-nums text-[var(--color-ink)]">
                        {fmtMoney(result.balances?.overallBalance)}
                    </strong>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-[var(--color-accent)]/15">
                <SummaryMetric label="Employees" value={payoutRows.length.toLocaleString()} />
                <SummaryMetric label="Available" value={fmtMoney(result.balances?.totalAvailable)} />
                <SummaryMetric label="Distributed" value={fmtMoney(result.balances?.totalDistributed)} />
                <SummaryMetric label="Runner pay" value={fmtMoney(result.allocations?.totalRunnerPay)} />
            </div>

            <div className="divide-y divide-[var(--color-accent)]/10 max-h-96 overflow-y-auto">
                {payoutRows.map((payout) => (
                    <div key={payout.uid} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-3">
                        <div className="flex flex-col">
                            <strong className="text-sm text-[var(--color-ink)]">{payout.name}</strong>
                            <span className="text-[11px] text-[var(--color-ink-muted)]">
                                {reviewRoleLabels[payout.role] || payout.role}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                            <span>CTP {fmtMoney(payout.tips)}</span>
                            <span>GRT {fmtMoney(payout.gratuity)}</span>
                            <span>Cash {fmtMoney(payout.cash)}</span>
                            <strong className="text-sm text-[var(--color-ink)]">
                                Total (CTP+GRT) {fmtMoney(getPayoutNonCashTotal(payout))}
                            </strong>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}


function CollapsibleSection({ title, subtitle, badge, isOpen, onToggle, children }) {
    return (
        <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]/50 transition-colors duration-150 text-left max-[560px]:px-4 max-[560px]:py-3"
            >
                <div className="flex flex-col gap-0.5">
                    {subtitle ? (
                        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                            {subtitle}
                        </span>
                    ) : null}
                    <h3 className="font-display text-xl font-medium tracking-tight text-[var(--color-ink)] max-[560px]:text-lg">
                        {title}
                    </h3>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {badge ? (
                        <span className="text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                            {badge}
                        </span>
                    ) : null}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`text-[var(--color-ink-muted)] transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden="true"
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
            </button>
            {isOpen ? (
                <div className="border-t border-[var(--color-line)]">
                    {children}
                </div>
            ) : null}
        </div>
    );
}

function ShiftEditorPanel({ date, allEmployees, onClose }) {
    const [teams, setTeams] = useState([
        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
    const [runners, setRunners] = useState([]);
    const [saveStatus, setSaveStatus] = useState("");
    const [validationMessages, setValidationMessages] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [calculatedReview, setCalculatedReview] = useState(null);
    const [shiftStatus, setShiftStatus] = useState(null);
    const [teamSetupOpen, setTeamSetupOpen] = useState(true);
    const [moneyCloseoutOpen, setMoneyCloseoutOpen] = useState(false);
    const [showLiveTotalDetails, setShowLiveTotalDetails] = useState(false);
    const realEmployeeUids = useMemo(
        () => new Set((allEmployees || []).map(employee => employee.uid).filter(Boolean)),
        [allEmployees]
    );

    const poolSummary = useMemo(() => {
        const teamSummaries = teams.map(getTeamSummary);
        const barSummary = getBarSummary(barTeam);
        const restaurantPoints = teams.reduce((sum, team) => (
            sum + team.members.reduce((memberSum, member) => memberSum + toMoney(member.points), 0)
        ), 0);
        const barPoints = barTeam.members.reduce((sum, member) => (
            sum + (member.points === null || member.points === undefined || member.points === "" ? 1 : toMoney(member.points))
        ), 0);

        const restaurantSales = teamSummaries.reduce((sum, team) => sum + team.sales, 0);
        const restaurantTips = teamSummaries.reduce((sum, team) => sum + team.tips, 0);
        const restaurantGratuity = teamSummaries.reduce((sum, team) => sum + team.gratuity + team.contractTotal, 0);
        const restaurantCash = teamSummaries.reduce((sum, team) => sum + team.cash, 0);
        const restaurantCovers = teamSummaries.reduce((sum, team) => sum + team.covers, 0);
        const contractTotal = teamSummaries.reduce((sum, team) => sum + team.contractTotal, 0);

        return {
            teams: teamSummaries,
            bar: barSummary,
            restaurantSales,
            totalSales: restaurantSales + barSummary.sales,
            totalTips: restaurantTips + barSummary.tips,
            totalGratuity: restaurantGratuity + barSummary.gratuity,
            totalCash: restaurantCash,
            totalCovers: restaurantCovers + barSummary.covers,
            contractTotal,
            runnerTransfer: barSummary.runnerTransfer,
            totalRunnerPay: runners.reduce((sum, runner) => sum + toMoney(runner.payoutAmount || RUNNER_FLAT_RATE), 0),
            payoutPool: restaurantTips + barSummary.tips + restaurantGratuity + barSummary.gratuity + restaurantCash,
            restaurantPoints,
            barPoints,
        };
    }, [teams, barTeam, runners]);

    const hasBarCloseoutData = Object.values(barTeam.pools || {}).some(value => toMoney(value) > 0);

    const updatePool = useCallback((teamId, field, value) => {
        setTeams(prev => prev.map(t =>
            t.teamId === teamId ? { ...t, pools: { ...t.pools, [field]: value } } : t
        ));
    }, []);

    const addContract = useCallback((teamId) => {
        setTeams(prev => prev.map(t =>
            t.teamId === teamId ? { ...t, contracts: [...(t.contracts || []), { name: "", gratuity: "" }] } : t
        ));
    }, []);

    const updateContract = useCallback((teamId, index, field, value) => {
        setTeams(prev => prev.map(t => {
            if (t.teamId === teamId) {
                const newContracts = [...(t.contracts || [])];
                newContracts[index] = { ...newContracts[index], [field]: value };
                return { ...t, contracts: newContracts };
            }
            return t;
        }));
    }, []);

    const removeContract = useCallback((teamId, index) => {
        setTeams(prev => prev.map(t => {
            if (t.teamId === teamId) {
                const newContracts = [...(t.contracts || [])];
                newContracts.splice(index, 1);
                return { ...t, contracts: newContracts };
            }
            return t;
        }));
    }, []);

    const toggleContractVisibility = useCallback((teamId) => {
        setTeams(prev => prev.map(team =>
            team.teamId === teamId ? { ...team, _showContracts: !team._showContracts } : team
        ));
    }, []);

    const updateBarPool = useCallback((field, value) => {
        setBarTeam(prev => ({ ...prev, pools: { ...prev.pools, [field]: value } }));
    }, []);

    const updateRunnerPayout = (uid, value) => {
        setRunners(prev => prev.map(runner =>
            runner.uid === uid ? { ...runner, payoutAmount: value } : runner
        ));
    };

    const markUserHistoryFlags = useCallback(async (status, payouts = {}) => {
        const flagUpdate = getHistoryFlagUpdate(status);
        const participantUids = getShiftParticipantUids({ teams, barTeam, runners, payouts })
            .filter(uid => realEmployeeUids.has(uid));

        await Promise.all(participantUids.map(uid =>
            updateDoc(doc(db, "users", uid), flagUpdate).catch(ignoreMissingUserDoc)
        ));
    }, [barTeam, realEmployeeUids, runners, teams]);

    const updateTeamMemberPoints = (teamId, uid, value) => {
        setTeams(prev => prev.map(team =>
            team.teamId === teamId
                ? {
                    ...team,
                    members: team.members.map(member =>
                        member.uid === uid ? { ...member, points: value } : member
                    )
                }
                : team
        ));
    };

    const adjustTeamMemberPoints = (teamId, uid, delta) => {
        setTeams(prev => prev.map(team =>
            team.teamId === teamId
                ? {
                    ...team,
                    members: team.members.map(member => {
                        if (member.uid !== uid) return member;
                        const current = toMoney(member.points);
                        return { ...member, points: Math.max(0, current + delta) };
                    })
                }
                : team
        ));
    };

    const updateBarMemberPoints = (uid, value) => {
        setBarTeam(prev => ({
            ...prev,
            members: prev.members.map(member =>
                member.uid === uid ? { ...member, points: value } : member
            )
        }));
    };

    const adjustBarMemberPoints = (uid, delta) => {
        setBarTeam(prev => ({
            ...prev,
            members: prev.members.map(member => {
                if (member.uid !== uid) return member;
                const current = member.points === null || member.points === undefined || member.points === ""
                    ? 1
                    : toMoney(member.points);
                return { ...member, points: Math.max(0, current + delta) };
            })
        }));
    };

    useEffect(() => {
        setCalculatedReview(null);
    }, [teams, barTeam, runners, date]);

    useEffect(() => {
        const loadShift = async () => {
            try {
                setLoading(true);
                setShiftStatus(null);
                const shiftDoc = await getDoc(doc(db, "shifts", date));
                if (shiftDoc.exists()) {
                    const d = shiftDoc.data();
                    if (d.teams) {
                        setTeams(d.teams.map(t => ({
                            teamId: t.teamId,
                            members: t.members || [],
                            pools: t.pools || { sales: t.teamSales || "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" },
                            contracts: t.contracts || []
                        })));
                    }
                    if (d.barTeam) {
                        setBarTeam({
                            members: d.barTeam.members || [],
                            pools: d.barTeam.pools || { sales: "", tips: "", gratuity: "", covers: "" }
                        });
                    }
                    if (d.runners) setRunners(d.runners);
                    setShiftStatus(d.status || (d.summary || d.payouts ? "closed" : "setup"));
                    setTeamSetupOpen(false);
                    setMoneyCloseoutOpen(true);
                }
            } catch (e) {
                console.error("Failed to load shift:", e);
            } finally {
                setLoading(false);
            }
        };
        loadShift();
    }, [date]);

    const handleSaveTeamSetup = async () => {
        if (isSaving) return;

        const inputErrors = validateTeamSetup({ teams, barTeam, runners });
        if (inputErrors.length > 0) {
            setValidationMessages(inputErrors);
            setSaveStatus("Assign staff before saving setup.");
            return;
        }

        setIsSaving(true);
        setValidationMessages([]);
        setSaveStatus("Saving team setup...");

        try {
            await setDoc(doc(db, "shifts", date), buildShiftSetupDraft({ date, teams, barTeam, runners }));
            await markUserHistoryFlags("setup");
            setShiftStatus("setup");
            setSaveStatus("Team setup saved.");
            setMoneyCloseoutOpen(true);
            setTimeout(() => setSaveStatus(""), 3000);
        } catch (e) {
            console.error(e);
            setSaveStatus("Failed to save team setup.");
            setValidationMessages(["The team setup could not be saved. Please try again."]);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCalculateForReview = () => {
        if (isSaving) return;

        const inputErrors = validateShiftInputs({ teams, barTeam, runners });
        if (inputErrors.length > 0) {
            setValidationMessages(inputErrors);
            setSaveStatus("Fix the highlighted items before saving.");
            return;
        }

        setValidationMessages([]);
        setSaveStatus("Calculating payouts…");

        const result = calculateShift({ teams, barTeam, runners });

        if (result.validations?.length > 0) {
            setValidationMessages(result.validations);
            setSaveStatus("Review warnings and calculated payouts before saving.");
        } else {
            setValidationMessages([]);
            setSaveStatus("Review calculated payouts before saving.");
        }

        const mappedPayoutsForFirebase = mapPayoutsForFirebase(result);
        const payoutCount = Object.keys(mappedPayoutsForFirebase).length;

        if (payoutCount === 0) {
            setValidationMessages(["Assign at least one employee before saving the shift."]);
            setSaveStatus("Cannot save shift: no employees are assigned.");
            setTimeout(() => setSaveStatus(""), 4000);
            return;
        }

        setCalculatedReview(buildPayoutReview(result, mappedPayoutsForFirebase));
    };

    const handleConfirmSave = async () => {
        if (isSaving || !calculatedReview) return;

        const mappedPayoutsForFirebase = calculatedReview.mappedPayouts;
        const result = calculatedReview.result;

        setIsSaving(true);
        setSaveStatus("Saving…");
        try {
            const shiftRef = doc(db, "shifts", date);
            const existingShiftDoc = await getDoc(shiftRef);
            const previousPayouts = existingShiftDoc.exists() ? existingShiftDoc.data().payouts || {} : {};
            const removedPayoutUids = getRemovedPayoutUids(previousPayouts, mappedPayoutsForFirebase);

            await setDoc(shiftRef, buildClosedShiftPayload({
                date,
                teams,
                barTeam,
                runners,
                payouts: mappedPayoutsForFirebase,
                summary: result,
            }));

            const saves = Object.entries(mappedPayoutsForFirebase).map(([uid, payout]) =>
                setDoc(doc(db, "users", uid, "tips", date), {
                    gratuity: payout.gratuity,
                    tip: payout.tips,
                    cash: payout.cash,
                    wineBonus: payout.wineBonus,
                    points: payout.points || 0,
                    total: payout.total,
                    role: payout.role,
                    shiftDate: date,
                    updatedAt: new Date().toISOString(),
                })
            );
            const deletes = removedPayoutUids.map(uid =>
                deleteDoc(doc(db, "users", uid, "tips", date))
            );
            await Promise.all([...saves, ...deletes]);
            await markUserHistoryFlags("closed", mappedPayoutsForFirebase);
            setSaveStatus("Saved.");
            setShiftStatus("closed");
            setCalculatedReview(null);

            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (e) {
            console.error(e);
            setSaveStatus("Failed to save.");
            setValidationMessages(["The shift could not be saved. Please try again."]);
            setIsSaving(false);
        }
    };

    const diningCount = teams.reduce((sum, team) => sum + team.members.length, 0);

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Workspace header */}
            <Card className="!p-0">
                <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-line)]">
                    <div className="flex flex-col gap-1">
                        <h2 className="font-display text-base sm:text-lg font-medium tracking-tight text-[var(--color-ink)]">
                            Shift Workspace — {date}
                        </h2>
                        {shiftStatus ? (
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                {shiftStatus === "closed" ? "Closed shift" : "Team setup saved"}
                            </span>
                        ) : null}
                        {saveStatus ? (
                            <span className="text-xs text-[var(--color-ink-soft)]">{saveStatus}</span>
                        ) : null}
                    </div>
                </header>

                {loading ? (
                    <div className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
                        Loading shift data…
                    </div>
                ) : (
                    <div className="p-3 sm:p-6 space-y-3">
                        {/* Team setup */}
                        <CollapsibleSection
                            title="Team Floor Setup"
                            subtitle="Opening setup"
                            badge={`${diningCount}d · ${barTeam.members.length}b · ${runners.length}r`}
                            isOpen={teamSetupOpen}
                            onToggle={() => setTeamSetupOpen(o => !o)}
                        >
                            <div className="p-3 sm:p-6">
                                <ShiftSetupDnd
                                    allEmployees={allEmployees}
                                    teams={teams} setTeams={setTeams}
                                    barTeam={barTeam} setBarTeam={setBarTeam}
                                    runners={runners} setRunners={setRunners}
                                />
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-5">
                                    <Button
                                        variant="secondary"
                                        onClick={handleSaveTeamSetup}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? "Saving..." : "Save Team Setup"}
                                    </Button>
                                </div>
                            </div>
                        </CollapsibleSection>

                        {/* Money closeout */}
                        <CollapsibleSection
                            title="Money Closeout"
                            subtitle="End of shift"
                            badge={!moneyCloseoutOpen ? fmtMoney(poolSummary.payoutPool) : null}
                            isOpen={moneyCloseoutOpen}
                            onToggle={() => setMoneyCloseoutOpen(o => !o)}
                        >
                        <section className="p-4 sm:p-6 space-y-4 max-[560px]:px-3">

                            {validationMessages.length > 0 ? (
                                <div role="alert" className="px-4 py-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-[var(--radius-sm)]">
                                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-danger)] mb-1">
                                        Review before saving
                                    </div>
                                    <ul className="list-disc pl-5 text-sm text-[var(--color-ink)] space-y-0.5">
                                        {validationMessages.map((message, index) => (
                                            <li key={`${message}-${index}`}>{message}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {/* Live totals */}
                            <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden">
                                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-5 py-4 border-b border-[var(--color-line)] max-[560px]:px-4 max-[560px]:py-3">
                                    <div className="flex items-end justify-between gap-3 max-[560px]:w-full">
                                        <div>
                                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                            Live shift totals
                                        </div>
                                        <div className="font-display text-2xl font-medium tracking-tight tabular-nums text-[var(--color-ink)] max-[560px]:text-2xl">
                                            {fmtMoney(poolSummary.payoutPool)}
                                        </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowLiveTotalDetails(open => !open)}
                                            className="hidden max-[560px]:inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-[var(--color-line)] px-3 text-xs font-medium text-[var(--color-accent)] bg-[var(--color-surface)]"
                                        >
                                            {showLiveTotalDetails ? "Hide details" : "Show details"}
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                                        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-1">{diningCount} dining</span>
                                        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-1">{barTeam.members.length} bar</span>
                                        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-1">{runners.length} runners</span>
                                    </div>
                                </div>

                                <div className={(showLiveTotalDetails ? "grid " : "hidden ") + "sm:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 px-5 py-4 max-[560px]:px-4 max-[560px]:gap-y-3"}>
                                    <SummaryMetric label="Sales" value={fmtMoney(poolSummary.totalSales)} />
                                    <SummaryMetric label="Tips CTP" value={fmtMoney(poolSummary.totalTips)} />
                                    <SummaryMetric label="Gratuity" value={fmtMoney(poolSummary.totalGratuity)} />
                                    <SummaryMetric label="Cash" value={fmtMoney(poolSummary.totalCash)} />
                                    <SummaryMetric label="Covers" value={poolSummary.totalCovers.toLocaleString()} />
                                    <SummaryMetric label="Runner pay" value={fmtMoney(poolSummary.totalRunnerPay)} />
                                    <SummaryMetric label="Bar transfer" value={fmtMoney(poolSummary.runnerTransfer)} />
                                    <SummaryMetric label="Dining pts" value={poolSummary.restaurantPoints.toLocaleString()} />
                                </div>

                                {poolSummary.contractTotal > 0 ? (
                                    <div className="px-5 py-2 text-xs text-[var(--color-ink-soft)] bg-[var(--color-surface-muted)]/50 border-t border-[var(--color-line)]">
                                        Contract gratuity included: {fmtMoney(poolSummary.contractTotal)}
                                    </div>
                                ) : null}
                            </div>

                            {/* Pool inputs */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {teams.map((t, idx) => (
                                    <TeamPoolCloseoutCard
                                        key={t.teamId}
                                        team={t}
                                        teamIndex={idx}
                                        summarySales={poolSummary.teams[idx].sales}
                                        summaryPool={poolSummary.teams[idx].payoutPool}
                                        summaryCovers={poolSummary.teams[idx].covers}
                                        onPoolChange={updatePool}
                                        onToggleContracts={toggleContractVisibility}
                                        onAddContract={addContract}
                                        onUpdateContract={updateContract}
                                        onRemoveContract={removeContract}
                                    />
                                ))}

                                {/* Bar */}
                                <BarPoolCloseoutCard
                                    barTeam={barTeam}
                                    summarySales={poolSummary.bar.sales}
                                    summaryPool={poolSummary.bar.payoutPool}
                                    summaryTransfer={poolSummary.bar.runnerTransfer}
                                    hasInputData={hasBarCloseoutData}
                                    onBarPoolChange={updateBarPool}
                                />
                            </div>

                            <PointAdjustmentsPanel
                                teams={teams}
                                barTeam={barTeam}
                                runners={runners}
                                totals={{ restaurant: poolSummary.restaurantPoints, bar: poolSummary.barPoints, runnerPay: poolSummary.totalRunnerPay }}
                                onTeamPointChange={updateTeamMemberPoints}
                                onTeamPointAdjust={adjustTeamMemberPoints}
                                onBarPointChange={updateBarMemberPoints}
                                onBarPointAdjust={adjustBarMemberPoints}
                                onRunnerPayoutChange={updateRunnerPayout}
                            />

                            {calculatedReview ? <CalculatedPayoutReview review={calculatedReview} /> : null}

                            {/* Save row */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
                                {saveStatus ? (
                                    <span aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">{saveStatus}</span>
                                ) : null}
                                {calculatedReview ? (
                                    <Button
                                        variant="secondary"
                                        onClick={handleCalculateForReview}
                                        disabled={isSaving}
                                    >
                                        Recalculate Payouts
                                    </Button>
                                ) : null}
                                <Button
                                    onClick={calculatedReview ? handleConfirmSave : handleCalculateForReview}
                                    disabled={isSaving}
                                >
                                    {isSaving
                                        ? "Saving…"
                                        : calculatedReview
                                            ? "Confirm & Save Shift"
                                            : "Calculate Payouts"}
                                </Button>
                            </div>
                        </section>
                        </CollapsibleSection>
                    </div>
                )}
            </Card>

        </div>
    );
}

export default ShiftEditorPanel;
