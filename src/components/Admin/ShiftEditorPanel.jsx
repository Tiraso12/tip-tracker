import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { calculateShift } from "../../utils/engine";
import ShiftSetupDnd from "./ShiftSetup/ShiftSetupDnd";
import DayRail from "./DayRail";
import ScrollRail from "./ScrollRail";
import { getRailSteps } from "../../utils/dayFlow";
import { getGroupMoneyStatus, summarizeGroupStatuses } from "../../utils/settleStatus";
import { Button, Card } from "../ui";
import { saveClosedShiftAtomically } from "../../utils/closeoutPersistence";
import { buildShiftSetupDraft } from "../../utils/shiftPersistence";
import { RUNNER_FLAT_RATE } from "../../utils/constants";
import { getHistoryFlagUpdate, getShiftParticipantUids } from "../../utils/userHistoryFlags";
import { useAuth } from "../../context/AuthContext";
import {
    buildPayoutReview,
    fmtMoney,
    getBarSummary,
    getPayoutNonCashTotal,
    getTeamSummary,
    ignoreMissingUserDoc,
    mapPayoutsForFirebase,
    roleLabels,
    toMoney,
    validateShiftInputs,
    validateTeamSetup,
} from "./shiftEditorUtils";

const NUMERIC_INPUT =
    "block w-full h-9 px-2.5 text-sm font-mono tabular-nums bg-[var(--color-surface)] max-[560px]:h-10 " +
    "text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] " +
    "border border-[var(--color-line)] rounded-[var(--radius-xs)] " +
    "transition-colors duration-150 hover:border-[var(--color-line-strong)] " +
    "focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 " +
    "appearance-none [-moz-appearance:textfield] " +
    "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function PoolField({ label, value, onChange, money = true }) {
    const id = `pool-field-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-soft)]">
                {label}
            </label>
            <div className="relative flex items-center">
                {money ? (
                    <span className="absolute left-3 text-[13px] text-[var(--color-ink-muted)] pointer-events-none">$</span>
                ) : null}
                <input
                    id={id}
                    type="number"
                    inputMode={money ? "decimal" : "numeric"}
                    min="0"
                    step="0.01"
                    className={NUMERIC_INPUT + (money ? " !pl-6" : "")}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={money ? "0.00" : "0"}
                    aria-label={label}
                />
            </div>
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

// Compact team pill for the horizontal switcher rail. One tap focuses that group's
// inputs in the single fixed-height panel below - the rail scrolls sideways on phone
// so the page height never grows with the roster.
const RailPill = memo(function RailPill({ group, selected, onSelect }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={onSelect}
            className={
                "flex-none inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--radius-md)] border " +
                "transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                (selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[inset_0_-2px_0_var(--color-accent)]"
                    : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-line-strong)]")
            }
        >
            <span className={"text-[13px] font-semibold whitespace-nowrap " + (selected ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]")}>
                {group.name}
            </span>
            <span className={"font-mono tabular-nums text-[11.5px] whitespace-nowrap " + (selected ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]")}>
                {group.poolLabel === "Pay" ? "Pay " : ""}${Math.round(group.pool).toLocaleString()}
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

// The single fixed-height entry panel. Its chrome (head + padded body) is identical for
// every group, so the panel is the same height for two teams or six - the whole point of
// the switcher. Body content is supplied by the caller per selected group.
function CloseoutEntryPanel({ group, children }) {
    return (
        <div className="border border-[var(--color-line-strong)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line)]">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-display text-[17px] font-medium tracking-tight text-[var(--color-ink)] truncate">
                        {group.name}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
                        {group.sub}
                    </span>
                </div>
                <div className="flex items-center gap-2.5 flex-none">
                    <span className="font-mono tabular-nums text-[12.5px] text-[var(--color-ink-soft)] whitespace-nowrap">
                        {group.poolLabel} <b className="text-[var(--color-ink)] font-semibold">{fmtMoney(group.pool)}</b>
                    </span>
                    {group.status === "funded" ? (
                        <span
                            className="h-[18px] w-[18px] rounded-full bg-[var(--color-success)] text-white inline-flex items-center justify-center text-[11px] leading-none"
                            title="Money in"
                            aria-label="Money in"
                        >
                            ✓
                        </span>
                    ) : group.status === "sales-only" ? (
                        <span
                            className="h-[18px] w-[18px] rounded-full bg-[var(--color-warning)] text-white inline-flex items-center justify-center text-[11px] font-bold leading-none"
                            title="Sales entered - tip pool still $0"
                            aria-label="Sales entered, tip pool still $0"
                        >
                            !
                        </span>
                    ) : null}
                </div>
            </div>
            <div className="p-4 max-[560px]:p-3.5">
                {children}
            </div>
        </div>
    );
}

// Money inputs for one dining team, plus the per-team contracts disclosure. Rendered
// inside the single entry panel (no card chrome of its own).
function TeamPoolFields({
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
                                        className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors"
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

// Money inputs for the bar pool. Rendered inside the single entry panel.
function BarPoolFields({ barTeam, onBarPoolChange }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <PoolField label="Bar Sales" value={barTeam.pools.sales} onChange={(value) => onBarPoolChange("sales", value)} />
            <PoolField label="Tips (CTP)" value={barTeam.pools.tips} onChange={(value) => onBarPoolChange("tips", value)} />
            <PoolField label="Gratuity" value={barTeam.pools.gratuity} onChange={(value) => onBarPoolChange("gratuity", value)} />
            <PoolField label="Covers" money={false} value={barTeam.pools.covers} onChange={(value) => onBarPoolChange("covers", value)} />
            <PoolField label="Runners Transfer" value={barTeam.pools.runners} onChange={(value) => onBarPoolChange("runners", value)} />
        </div>
    );
}

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

// Per-group point split, folded into the entry panel as a calm collapsed disclosure so
// the panel height stays constant. Opening it reveals only the selected group's members.
function PointSplitDisclosure({ title, members, defaultPoints = 0, emptyMessage, onPointChange, onPointAdjust }) {
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

function CalculatedPayoutReview({ review, poolAvailable, availableCash = 0 }) {
    const { result, payoutRows, staffTotal } = review;
    // The pool and the staff take-home read as two competing "totals"; the gap is the
    // house/door cut the engine holds back from the pool. Show it as one small equation
    // so the two numbers read as related, not contradictory.
    const houseDoor = Math.max(0, (Number(poolAvailable) || 0) - staffTotal);
    const [showAllMobilePayouts, setShowAllMobilePayouts] = useState(false);
    const verificationPayout = payoutRows.find(payout => payout.role === "captain") || payoutRows[0];
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-[var(--color-accent)]/20 max-[560px]:flex-row max-[560px]:items-start max-[560px]:px-4 max-[560px]:py-3">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Staff take-home
                    </div>
                    <div className="font-display text-2xl font-medium tracking-tight tabular-nums text-[var(--color-accent)] max-[560px]:text-xl">
                        {fmtMoney(staffTotal)}
                    </div>
                </div>
                <div className="flex flex-col items-end max-[560px]:pt-0.5">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">Balance</span>
                    <strong className="font-mono tabular-nums text-[var(--color-ink)]">
                        {fmtMoney(result.balances?.overallBalance)}
                    </strong>
                </div>
            </div>

            {/* Reconciliation: how the pool derives the staff take-home (pool − house/door). */}
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-5 py-3 border-b border-[var(--color-accent)]/15 text-center max-[560px]:px-4 max-[560px]:py-2.5">
                <span className="inline-flex items-baseline gap-1.5">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">Available pool</span>
                    <span className="font-mono tabular-nums text-sm text-[var(--color-ink)]">{fmtMoney(poolAvailable)}</span>
                </span>
                <span className="font-mono text-[var(--color-ink-muted)]">−</span>
                <span className="inline-flex items-baseline gap-1.5">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">House / door</span>
                    <span className="font-mono tabular-nums text-sm text-[var(--color-ink)]">{fmtMoney(houseDoor)}</span>
                </span>
                <span className="font-mono text-[var(--color-ink-muted)]">=</span>
                <span className="inline-flex items-baseline gap-1.5">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">Staff take-home</span>
                    <span className="font-mono tabular-nums text-sm font-semibold text-[var(--color-accent)]">{fmtMoney(staffTotal)}</span>
                </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-[var(--color-accent)]/15 max-[560px]:gap-x-5 max-[560px]:gap-y-2 max-[560px]:px-4 max-[560px]:py-2.5">
                {/* Cash is money too, but it is distributed separately and must never fold
                    into the pool total (CTP + GRT). Show the pool and cash as two clearly
                    separated figures so "Available" never means two different numbers. */}
                <SummaryMetric label="Employees" value={payoutRows.length.toLocaleString()} />
                <SummaryMetric label="Available pool" value={fmtMoney(poolAvailable)} />
                <SummaryMetric label="Available cash" value={fmtMoney(availableCash)} />
                <SummaryMetric label="Runner pay" value={fmtMoney(result.allocations?.totalRunnerPay)} />
            </div>

            <div className="hidden max-[560px]:block px-4 py-2.5 border-b border-[var(--color-accent)]/15">
                {verificationPayout ? (
                    <div className="rounded-[var(--radius-sm)] border border-[var(--color-accent)]/20 bg-[var(--color-surface)] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                    {verificationPayout.role === "captain" ? "Captain check" : "Payout check"}
                                </div>
                                <div className="mt-1 text-sm font-semibold text-[var(--color-ink)] truncate">
                                    {verificationPayout.name}
                                </div>
                            </div>
                            <strong className="shrink-0 font-mono tabular-nums text-base text-[var(--color-ink)]">
                                {fmtMoney(getPayoutNonCashTotal(verificationPayout))}
                            </strong>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-1.5 text-xs">
                            <span className="font-medium uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                                Cash
                            </span>
                            <strong className="font-mono tabular-nums text-[var(--color-ink)]">
                                {fmtMoney(verificationPayout.cash)}
                            </strong>
                        </div>
                    </div>
                ) : null}

                <button
                    type="button"
                    onClick={() => setShowAllMobilePayouts(open => !open)}
                    className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-accent)]"
                >
                    {showAllMobilePayouts ? "Hide all payouts" : "Show all payouts"}
                </button>
            </div>

            <div className={(showAllMobilePayouts ? "block " : "hidden ") + "sm:block divide-y divide-[var(--color-accent)]/10 max-h-96 overflow-y-auto"}>
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


function ShiftEditorPanel({ date, allEmployees, onClose, initialStep = "floor" }) {
    const { user } = useAuth();
    const [teams, setTeams] = useState([
        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
    const [runners, setRunners] = useState([]);
    const [saveStatus, setSaveStatus] = useState("");
    const [validationMessages, setValidationMessages] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasLoadedShift, setHasLoadedShift] = useState(false);
    const [calculatedReview, setCalculatedReview] = useState(null);
    const [shiftStatus, setShiftStatus] = useState(null);
    // Day-step spine (shared by both flow shells): "floor" -> "settle" -> "review".
    // The old two-accordion editor is retired; each step is its own focused screen.
    const [step, setStep] = useState(initialStep === "settle" ? "settle" : "floor");
    const [activeGroupId, setActiveGroupId] = useState("team-1");
    const [draftStatus, setDraftStatus] = useState("");
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
            payoutPool: restaurantTips + barSummary.tips + restaurantGratuity + barSummary.gratuity,
            restaurantPoints,
            barPoints,
        };
    }, [teams, barTeam, runners]);

    // Descriptors for the switcher rail + entry panel: one entry per dining team, then Bar,
    // then Runners. Each carries the display name, roster sub-line, live pool, and whether
    // any money has been entered (drives the status dot / check).
    const closeoutGroups = useMemo(() => {
        const teamGroups = teams.map((team, index) => {
            const pool = poolSummary.teams[index]?.payoutPool ?? 0;
            const hasPeople = team.members.length > 0;
            // "Other input" = non-pool money/context (Sales/Cash/Covers). The pool
            // itself (Tips + Gratuity + contract gratuity) is what funds payouts.
            const hasOtherInput = toMoney(team.pools?.sales) > 0
                || toMoney(team.pools?.cash) > 0
                || toMoney(team.pools?.covers) > 0;
            return {
                id: team.teamId,
                kind: "dining",
                name: `Team ${index + 1}`,
                sub: `${team.members.length} ${team.members.length === 1 ? "member" : "members"} · dining`,
                poolLabel: "Pool",
                pool,
                hasPeople,
                status: getGroupMoneyStatus({ pool, hasOtherInput, hasPeople }),
                teamIndex: index,
            };
        });
        const barPool = poolSummary.bar.payoutPool;
        const barHasPeople = barTeam.members.length > 0;
        const barHasOtherInput = toMoney(barTeam.pools?.sales) > 0 || toMoney(barTeam.pools?.covers) > 0;
        const runnerPool = poolSummary.totalRunnerPay;
        return [
            ...teamGroups,
            {
                id: "bar",
                kind: "bar",
                name: "Bar Team",
                sub: `${barTeam.members.length} ${barTeam.members.length === 1 ? "member" : "members"} · bar`,
                poolLabel: "Pool",
                pool: barPool,
                hasPeople: barHasPeople,
                status: getGroupMoneyStatus({ pool: barPool, hasOtherInput: barHasOtherInput, hasPeople: barHasPeople }),
            },
            {
                id: "runners",
                kind: "runners",
                name: "Runners",
                sub: `${runners.length} ${runners.length === 1 ? "runner" : "runners"}`,
                poolLabel: "Pay",
                pool: runnerPool,
                hasPeople: runners.length > 0,
                status: getGroupMoneyStatus({ pool: runnerPool, hasOtherInput: false, hasPeople: runners.length > 0 }),
            },
        ];
    }, [teams, barTeam, runners, poolSummary]);

    const activeGroup = closeoutGroups.find(group => group.id === activeGroupId) || closeoutGroups[0];
    const groupStatusSummary = summarizeGroupStatuses(closeoutGroups);

    const hasAssignedStaff = useMemo(() => (
        teams.some(team => team.members.length > 0) || barTeam.members.length > 0 || runners.length > 0
    ), [barTeam.members.length, runners.length, teams]);

    const hasCloseoutDraftData = useMemo(() => (
        teams.some(team => (
            Object.values(team.pools || {}).some(value => toMoney(value) > 0)
            || (team.contracts || []).some(contract => toMoney(contract.gratuity) > 0)
        ))
        || Object.values(barTeam.pools || {}).some(value => toMoney(value) > 0)
        || runners.some(runner => toMoney(runner.payoutAmount) !== RUNNER_FLAT_RATE)
    ), [barTeam.pools, runners, teams]);

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
                setHasLoadedShift(false);
                setDraftStatus("");
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
                    setShiftStatus(d.status || (d.summary || d.firstClosedAt || d.payouts ? "closed" : "setup"));
                } else {
                    setTeams([
                        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
                    ]);
                    setBarTeam({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
                    setRunners([]);
                }
            } catch (e) {
                console.error("Failed to load shift:", e);
            } finally {
                setHasLoadedShift(true);
                setLoading(false);
            }
        };
        loadShift();
    }, [date]);

    useEffect(() => {
        if (!hasLoadedShift || loading || isSaving || shiftStatus === "closed") return undefined;
        if (!hasAssignedStaff && !hasCloseoutDraftData) return undefined;

        let cancelled = false;
        const timeoutId = window.setTimeout(async () => {
            setDraftStatus("Saving draft...");
            try {
                await setDoc(doc(db, "shifts", date), buildShiftSetupDraft({
                    date,
                    teams,
                    barTeam,
                    runners,
                    includeCloseoutDraft: true,
                }));

                if (!cancelled) {
                    setShiftStatus("setup");
                    setDraftStatus("Draft saved.");
                }
            } catch (e) {
                console.error("Failed to autosave closeout draft:", e);
                if (!cancelled) {
                    setDraftStatus("Draft autosave failed.");
                }
            }
        }, 1000);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [
        barTeam,
        date,
        hasAssignedStaff,
        hasCloseoutDraftData,
        hasLoadedShift,
        isSaving,
        loading,
        runners,
        shiftStatus,
        teams,
    ]);

    const handleSaveTeamSetup = async () => {
        if (isSaving) return;

        if (shiftStatus === "closed") {
            setSaveStatus("This shift is already closed and paid out. Use Calculate Payouts → Confirm & Save Shift to update the roster and payouts together.");
            return false;
        }

        const inputErrors = validateTeamSetup({ teams, barTeam, runners });
        if (inputErrors.length > 0) {
            setValidationMessages(inputErrors);
            setSaveStatus("Assign staff before saving the floor plan.");
            return false;
        }

        setIsSaving(true);
        setValidationMessages([]);
        setSaveStatus("Saving floor plan...");

        try {
            await setDoc(doc(db, "shifts", date), buildShiftSetupDraft({ date, teams, barTeam, runners }));
            await markUserHistoryFlags("setup");
            setShiftStatus("setup");
            setSaveStatus("Floor plan saved.");
            setTimeout(() => setSaveStatus(""), 3000);
            return true;
        } catch (e) {
            console.error(e);
            setSaveStatus("Failed to save floor plan.");
            setValidationMessages(["The floor plan could not be saved. Please try again."]);
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    // Floor plan forward action: save the lineup, then advance to Settle up.
    const handleContinueFromFloor = async () => {
        const ok = await handleSaveTeamSetup();
        if (!ok) return;
        setStep("settle");
    };

    // Day rail step navigation. Earlier steps are always reachable; Review is only
    // reachable once payouts have been calculated. "payout" exits to the landing.
    const goToStep = (key) => {
        if (key === "payout") { onClose(); return; }
        if (key === "review" && !calculatedReview) return;
        setStep(key);
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
        setStep("review");
    };

    const handleConfirmSave = async () => {
        if (isSaving || !calculatedReview) return;

        const mappedPayoutsForFirebase = calculatedReview.mappedPayouts;
        const result = calculatedReview.result;

        setIsSaving(true);
        setSaveStatus("Saving…");
        try {
            await saveClosedShiftAtomically({
                db,
                date,
                teams,
                barTeam,
                runners,
                payouts: mappedPayoutsForFirebase,
                summary: result,
                realEmployeeUids,
                updatedBy: user?.uid || null,
            });
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

    // Effective step guards a stray "review" with no calculation behind it.
    const effectiveStep = step === "review" && !calculatedReview ? "settle" : step;

    // Day-level step status for the rail. Status is always shown; order is never
    // hard-forced - any earlier/reachable step is one tap away.
    const railSteps = getRailSteps({
        activeStep: effectiveStep,
        shiftStatus,
        hasCalculatedReview: Boolean(calculatedReview),
    });

    const STEP_META = {
        floor: { eyebrow: "Step 1", title: "Floor plan", hint: "Build the shift lineup." },
        settle: { eyebrow: "Step 2", title: "Settle up", hint: "Enter end-of-service money." },
        review: { eyebrow: "Step 3", title: "Review", hint: "Check take-home before saving." },
    };
    const stepMeta = STEP_META[effectiveStep];

    return (
        <div className="space-y-3 sm:space-y-4">
            {/* The day rail: an ordered, day-level step spine. Status is always
                shown; earlier/reachable steps are one tap away (order never forced). */}
            <DayRail steps={railSteps} onStepClick={goToStep} />

            <Card className="!p-0">
                <header className="hidden sm:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-line)]">
                    <div className="flex flex-col gap-1">
                        <h2 className="font-display text-base sm:text-lg font-medium tracking-tight text-[var(--color-ink)]">
                            Shift Workspace - {date}
                        </h2>
                        {shiftStatus ? (
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                {shiftStatus === "closed" ? "Closed shift" : "Floor plan saved"}
                            </span>
                        ) : null}
                        {saveStatus ? (
                            <span className="text-xs text-[var(--color-ink-soft)]">{saveStatus}</span>
                        ) : draftStatus ? (
                            <span className="text-xs text-[var(--color-ink-soft)]">{draftStatus}</span>
                        ) : null}
                    </div>
                </header>

                {/* Mobile status strip: the workspace header above is `hidden sm:flex`,
                    so on phones the closed / paid-out cue would otherwise vanish and an
                    admin could re-save a paid-out shift blind. Surface a compact,
                    always-visible strip that mirrors the desktop badge. */}
                {shiftStatus ? (
                    shiftStatus === "closed" ? (
                        <div className="sm:hidden flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--color-warning)]/25 bg-[var(--color-warning-soft)]">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-warning)]">
                                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                                Closed shift · Paid out
                            </span>
                            <span className="text-[11px] tabular-nums text-[var(--color-warning)]/80">{date}</span>
                        </div>
                    ) : (
                        <div className="sm:hidden px-3 py-2.5 border-b border-[var(--color-line)]">
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                Floor plan saved
                            </span>
                        </div>
                    )
                ) : null}

                {loading ? (
                    <div className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
                        Loading shift data…
                    </div>
                ) : (
                    <div className="p-3 sm:p-6">
                        {/* Focused step heading (the step spine lives in the day chrome above) */}
                        <div className="mb-4 flex items-end justify-between gap-3 max-[560px]:mb-3">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                    {stepMeta.eyebrow}
                                </span>
                                <h3 className="font-display text-xl font-medium tracking-tight text-[var(--color-ink)] max-[560px]:text-lg">
                                    {stepMeta.title}
                                </h3>
                                <p className="text-xs text-[var(--color-ink-soft)]">{stepMeta.hint}</p>
                            </div>
                            {effectiveStep === "floor" ? (
                                <span className="shrink-0 text-xs font-mono tabular-nums text-[var(--color-ink-soft)] max-[560px]:hidden">
                                    {`${diningCount}d · ${barTeam.members.length}b · ${runners.length}r`}
                                </span>
                            ) : null}
                        </div>

                        {validationMessages.length > 0 ? (
                            <div role="alert" className="mb-4 px-4 py-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-[var(--radius-sm)]">
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

                        {/* STEP 1 - Floor plan */}
                        {effectiveStep === "floor" ? (
                            <div>
                                <ShiftSetupDnd
                                    allEmployees={allEmployees}
                                    teams={teams} setTeams={setTeams}
                                    barTeam={barTeam} setBarTeam={setBarTeam}
                                    runners={runners} setRunners={setRunners}
                                />
                                <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-end max-[560px]:sticky max-[560px]:bottom-0 max-[560px]:z-20 max-[560px]:-mx-3 max-[560px]:mt-2 max-[560px]:border-t max-[560px]:border-[var(--color-line)] max-[560px]:bg-[var(--color-surface)] max-[560px]:p-3 max-[560px]:shadow-[0_-10px_24px_rgba(15,23,42,0.08)]">
                                    {shiftStatus === "closed" ? (
                                        <span className="text-xs text-[var(--color-ink-soft)]">
                                            This shift is already closed and paid out. Roster changes are saved via Settle up → Confirm & Save Shift.
                                        </span>
                                    ) : (
                                        <Button
                                            onClick={handleContinueFromFloor}
                                            disabled={isSaving}
                                            className="max-[560px]:w-full"
                                        >
                                            {isSaving ? "Saving..." : "Save & continue to Settle up →"}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : effectiveStep === "settle" ? (
                            /* STEP 2 - Settle up (the calm single money switcher, unchanged) */
                            <section className="space-y-4">
                                {/* Team switcher: a compact horizontal strip above one fixed-height entry
                                    panel. Tapping a pill focuses that group; the strip scrolls sideways on
                                    phone so page height stays constant no matter how large the roster is.
                                    A status line + edge fade keep off-screen groups and their money status
                                    discoverable instead of a blind sideways swipe. */}
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                                        {groupStatusSummary.total} {groupStatusSummary.total === 1 ? "group" : "groups"}
                                    </span>
                                    {groupStatusSummary.total > 0 ? (
                                        groupStatusSummary.needsMoney > 0 ? (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-warning)]">
                                                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                                                {groupStatusSummary.needsMoney} still need money
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
                                                <span aria-hidden="true">✓</span>
                                                All groups funded
                                            </span>
                                        )
                                    ) : null}
                                </div>
                                <ScrollRail
                                    role="tablist"
                                    ariaLabel="Select a group to enter money"
                                    depsKey={closeoutGroups.length}
                                    className="flex gap-2 overflow-x-auto overflow-y-hidden px-0.5 pt-0.5 pb-2 pr-8 [scrollbar-width:thin]"
                                >
                                    {closeoutGroups.map(group => (
                                        <RailPill
                                            key={group.id}
                                            group={group}
                                            selected={group.id === activeGroup.id}
                                            onSelect={() => setActiveGroupId(group.id)}
                                        />
                                    ))}
                                </ScrollRail>

                                <CloseoutEntryPanel key={activeGroup.id} group={activeGroup}>
                                    {activeGroup.kind === "dining" ? (
                                        <>
                                            <TeamPoolFields
                                                team={teams[activeGroup.teamIndex]}
                                                onPoolChange={updatePool}
                                                onToggleContracts={toggleContractVisibility}
                                                onAddContract={addContract}
                                                onUpdateContract={updateContract}
                                                onRemoveContract={removeContract}
                                            />
                                            <PointSplitDisclosure
                                                title={activeGroup.name}
                                                members={teams[activeGroup.teamIndex].members}
                                                emptyMessage="No dining room employees on this team."
                                                onPointChange={(uid, value) => updateTeamMemberPoints(activeGroup.id, uid, value)}
                                                onPointAdjust={(uid, delta) => adjustTeamMemberPoints(activeGroup.id, uid, delta)}
                                            />
                                        </>
                                    ) : activeGroup.kind === "bar" ? (
                                        <>
                                            <BarPoolFields barTeam={barTeam} onBarPoolChange={updateBarPool} />
                                            <PointSplitDisclosure
                                                title="Bar Team"
                                                members={barTeam.members}
                                                defaultPoints={1}
                                                emptyMessage="No bar employees assigned."
                                                onPointChange={updateBarMemberPoints}
                                                onPointAdjust={adjustBarMemberPoints}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)] mb-3">
                                                Runner pay is drawn from the tip pool. Enter each runner's take-home.
                                            </p>
                                            <RunnerGroup
                                                runners={runners}
                                                totalPay={poolSummary.totalRunnerPay}
                                                onPayoutChange={updateRunnerPayout}
                                            />
                                        </>
                                    )}
                                </CloseoutEntryPanel>

                                {/* Settle-up total + advance to Review */}
                                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between max-[560px]:sticky max-[560px]:bottom-0 max-[560px]:z-20 max-[560px]:-mx-3 max-[560px]:mt-2 max-[560px]:border-t max-[560px]:border-[var(--color-line)] max-[560px]:bg-[var(--color-surface)] max-[560px]:p-3 max-[560px]:shadow-[0_-10px_24px_rgba(15,23,42,0.08)]">
                                    <div className="flex items-center justify-between gap-3 sm:justify-start">
                                        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                                            Settle-up total
                                        </span>
                                        <strong className="font-mono tabular-nums text-base text-[var(--color-ink)]">
                                            {fmtMoney(poolSummary.payoutPool)}
                                        </strong>
                                    </div>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                                        {groupStatusSummary.needsMoney > 0 ? (
                                            <span className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--color-warning)]">
                                                <span aria-hidden="true">⚠</span>
                                                <span>{groupStatusSummary.needsMoney} {groupStatusSummary.needsMoney === 1 ? "group has" : "groups have"} no tip pool yet</span>
                                            </span>
                                        ) : saveStatus ? (
                                            <span aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">{saveStatus}</span>
                                        ) : draftStatus ? (
                                            <span aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">{draftStatus}</span>
                                        ) : null}
                                        <Button
                                            onClick={handleCalculateForReview}
                                            disabled={isSaving}
                                            className="max-[560px]:w-full"
                                        >
                                            {isSaving ? "Calculating…" : "Calculate Payouts →"}
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        ) : (
                            /* STEP 3 - Review -> Confirm & Save */
                            <section className="space-y-4">
                                <CalculatedPayoutReview review={calculatedReview} poolAvailable={poolSummary.payoutPool} availableCash={poolSummary.totalCash} />
                                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between max-[560px]:sticky max-[560px]:bottom-0 max-[560px]:z-20 max-[560px]:-mx-3 max-[560px]:mt-2 max-[560px]:border-t max-[560px]:border-[var(--color-line)] max-[560px]:bg-[var(--color-surface)] max-[560px]:p-3 max-[560px]:shadow-[0_-10px_24px_rgba(15,23,42,0.08)]">
                                    <Button
                                        variant="secondary"
                                        onClick={() => setStep("settle")}
                                        disabled={isSaving}
                                        className="max-[560px]:w-full"
                                    >
                                        ← Back to Settle up
                                    </Button>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                                        {shiftStatus === "closed" ? (
                                            <p className="sm:hidden flex items-start gap-1.5 text-[11px] leading-snug text-[var(--color-warning)]">
                                                <span aria-hidden="true">⚠</span>
                                                <span>Re-saving overwrites the saved payouts for {date}.</span>
                                            </p>
                                        ) : null}
                                        {saveStatus ? (
                                            <span aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">{saveStatus}</span>
                                        ) : draftStatus ? (
                                            <span aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">{draftStatus}</span>
                                        ) : null}
                                        <Button
                                            onClick={handleConfirmSave}
                                            disabled={isSaving}
                                            className="max-[560px]:w-full"
                                        >
                                            {isSaving ? "Saving…" : "Confirm & Save Shift"}
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </Card>

        </div>
    );
}

export default ShiftEditorPanel;
