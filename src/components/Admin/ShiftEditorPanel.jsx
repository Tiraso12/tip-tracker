import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ROLE_POINTS, RUNNER_FLAT_RATE } from "../../utils/constants";
import { getHistoryFlagUpdate, getShiftParticipantUids } from "../../utils/userHistoryFlags";
import { useAuth } from "../../context/AuthContext";
import {
    buildPayoutReview,
    fmtAmount,
    fmtMoney,
    getBarSummary,
    getPayoutNonCashTotal,
    getTeamSummary,
    ignoreMissingUserDoc,
    isNegativeMoney,
    mapPayoutsForFirebase,
    roleLabels,
    selectSpotCheckSubject,
    toMoney,
    validateShiftInputs,
    validateTeamSetup,
} from "./shiftEditorUtils";

const NUMERIC_INPUT =
    // Money/number entry. On phones the field is a full 44px tap target and 16px
    // text (the iOS focus-zoom threshold), so entering money never zooms the page.
    "block w-full h-9 px-2.5 text-sm font-mono tabular-nums bg-[var(--color-surface)] max-[560px]:h-11 max-[560px]:text-base " +
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
                "flex-none inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--radius-md)] border max-[560px]:min-h-[44px] " +
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

// The "everyone" roster under the spot-check card. Three money columns just wide
// enough for a four-figure payout, so a 390px phone still leaves the name column
// enough room to read; the columns are fixed rather than fluid so the digits stay in
// their own vertical run down the list.
// One figure, rendered for the eye to compare against a spreadsheet column. The "$"
// is small, muted and floats with the digits instead of sitting in its own column -
// a pinned "$" would push a 3-digit figure out of alignment with a 2-digit one, and
// the decimal points lining up is the whole point of the card. Always two decimals:
// the captain's tolerance is measured in cents, so the cents are load-bearing.
function HeroMoney({ value, className = "" }) {
    return (
        <span className={"inline-flex items-baseline whitespace-nowrap font-mono tabular-nums " + className}>
            {isNegativeMoney(value) ? <span aria-hidden="true">−</span> : null}
            <span className="text-[0.55em] font-normal text-[var(--color-ink-muted)] mr-px">$</span>
            {fmtAmount(value)}
        </span>
    );
}

// A row of the spot-check card: label hard left, figure hard right, nothing in
// between, hairline underneath. The hairline is what re-anchors the eye each time it
// comes back from the spreadsheet, so a row is never silently skipped.
function SpotCheckRow({ label, sub, value, rule = "hairline", emphasis = false }) {
    const ruleClass = rule === "total"
        ? "border-b-2 border-[var(--color-ink)]/70"
        : rule === "none"
            ? ""
            : "border-b border-[var(--color-line)]";
    return (
        <div className={"flex items-baseline justify-between gap-4 px-4 py-3 min-h-[44px] " + ruleClass}>
            <span className="flex flex-col">
                <span className={"text-[13px] font-semibold uppercase tracking-[0.1em] "
                    + (emphasis ? "text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]")}>
                    {label}
                </span>
                {/* Sub-lines stay lowercase: uppercased they are wide enough to wrap
                    beside a 28px figure on a 390px phone, which breaks the row rhythm. */}
                {sub ? (
                    <span className="mt-0.5 text-[10px] tracking-[0.02em] text-[var(--color-ink-muted)]">{sub}</span>
                ) : null}
            </span>
            <HeroMoney
                value={value}
                className={"text-[22px] leading-none max-[380px]:text-[20px] "
                    + (emphasis ? "font-semibold text-[var(--color-accent)]" : "text-[var(--color-ink)]")}
            />
        </div>
    );
}

// The whole point of the Review step. One person, their figures, laid out as the
// vertical column a spreadsheet is read from. Nothing on the page outranks these
// figures - the card carries no eyebrow label, because the screen is the spot check.
function SpotCheckCard({ subject }) {
    const { payout, atFullPoints, isCaptain } = subject;
    const isRunner = payout.role === "runner";
    // A runner has no CTP/GRT/cash in the engine at all - only a flat payout
    // (engine.js:99-110). Rendering the usual three rows would show two convincing
    // $0.00 figures that mean nothing, so a runner gets a single Runner pay figure.
    const points = toMoney(payout.points);

    return (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-accent)]/25 bg-[var(--color-surface)] overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="px-4 pt-3 pb-2.5 border-b border-[var(--color-line)]">
                <div className="text-lg font-semibold leading-tight text-[var(--color-ink)]">{payout.name}</div>
                <div className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                    {roleLabels[payout.role] || payout.role}
                    {isRunner ? null : <> · {points} {points === 1 ? "pt" : "pts"}</>}
                    {payout.teamId ? <> · {payout.teamId}</> : null}
                </div>
            </div>

            {/* The subject is the first captain at full point weighting. When there is
                none, say so out loud: a captain who left early takes home less than the
                full-shift captain the spreadsheet is read from, and a silent swap would
                read as a mismatch that is not one. */}
            {!atFullPoints ? (
                <p className="px-4 py-2 border-b border-[var(--color-line)] bg-[var(--color-warning-soft)] text-[11px] leading-snug text-[var(--color-warning)]">
                    {isCaptain
                        ? `No captain at full points tonight - this one worked ${points} of ${ROLE_POINTS.captain}, so expect less than your sheet's full-shift captain.`
                        : "No captain on this shift - checking the first payout instead."}
                </p>
            ) : null}

            {isRunner ? (
                <SpotCheckRow
                    label="Runner pay"
                    sub="flat rate · not pooled"
                    value={getPayoutNonCashTotal(payout)}
                    rule="none"
                    emphasis
                />
            ) : (
                <>
                    <SpotCheckRow label="CTP" value={payout.tips} />
                    <SpotCheckRow label="GRT" value={payout.gratuity} />
                    <SpotCheckRow label="Cash" value={payout.cash} rule="none" />
                    {/* Total reads last and is the one row lifted onto its own background,
                        closed by the accent bar - it is the bottom line, so it is what the
                        card emphasises. Cash needs no fencing of its own: the "CTP + GRT"
                        line under the figure already says what is in it, and staff know cash
                        is paid out separately. Computed from tips + gratuity rather than read
                        from the stored per-person `total`: the stored field now agrees (it is
                        CTP + GRT for every role), but ledger docs written before that rule
                        still fold cash in for dining staff, so the card computes and stays
                        right on old shifts too. */}
                    <div className="border-t-[3px] border-[var(--color-accent)] bg-[var(--color-surface-muted)]">
                        <SpotCheckRow
                            label="Total"
                            sub="CTP + GRT"
                            value={getPayoutNonCashTotal(payout)}
                            rule="none"
                            emphasis
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// One collapsed row of supporting evidence under the spot-check card. All three rows
// (money, floor, totals) share this shell so none of them reads as more urgent than
// the others - the card is the screen, these are where you look if it disagrees.
//
// Everything inside is READ-ONLY, and that is structural rather than a preference: any
// edit to money or roster nulls the calculation (ShiftEditorPanel `setCalculatedReview(null)`
// on [teams, barTeam, runners, date]) and Review immediately falls back to Settle up.
// So diagnosis happens here and each row offers one jump out to where writes belong.
function ReviewDisclosure({ title, meta, open, onToggle, children }) {
    return (
        <div className={"rounded-[var(--radius-md)] border "
            + (open
                ? "border-[var(--color-line-strong)] bg-[var(--color-surface-muted)]"
                : "border-[var(--color-line)] bg-[var(--color-surface)]")}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left min-h-[44px]"
            >
                <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-ink)]">
                    <span aria-hidden="true" className={"text-[var(--color-ink-muted)] transition-transform duration-150 " + (open ? "rotate-90" : "")}>▸</span>
                    {title}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--color-ink-soft)]">{meta}</span>
            </button>
            {open ? <div className="px-3.5 pb-3.5">{children}</div> : null}
        </div>
    );
}

// The jump out of a read-only row to the screen where that thing is actually edited.
// Full width rather than a right-aligned link: the save button floats bottom-right, so
// a short right-aligned action sits exactly where the pill lands and reads as missing.
function FixJump({ label, onClick }) {
    return (
        <button
            type="button"
            onClick={() => onClick?.()}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent)]"
        >
            {label} <span aria-hidden="true">→</span>
        </button>
    );
}

function CalculatedPayoutReview({
    review,
    poolAvailable,
    availableCash = 0,
    moneyGroups = [],
    floorGroups = [],
    floorPoints = 0,
    onFixMoney,
    onFixFloor,
}) {
    const { result, payoutRows, staffTotal } = review;
    // The pool and the staff take-home read as two competing "totals"; the gap is the
    // house/door cut the engine holds back from the pool. Show it as one small equation
    // so the two numbers read as related, not contradictory.
    const houseDoor = Math.max(0, (Number(poolAvailable) || 0) - staffTotal);
    // One row open at a time: the spot-check card is the point of the screen and must
    // not be pushed off the top by two expanded blocks at once.
    const [openRow, setOpenRow] = useState(null);
    const subject = selectSpotCheckSubject(payoutRows);
    const floorHeadcount = floorGroups.reduce((sum, group) => sum + group.members.length, 0);
    const toggle = (row) => setOpenRow(current => (current === row ? null : row));

    return (
        <div className="space-y-2.5">
            {subject ? <SpotCheckCard subject={subject} /> : null}

            {/* Every number typed at Settle up, all groups on one screen. Settle up is a
                one-group-at-a-time switcher, so scanning for a typo there means tapping
                through groups; here it is a single read. */}
            <ReviewDisclosure
                title="Money you entered"
                meta={`${moneyGroups.length} ${moneyGroups.length === 1 ? "group" : "groups"}`}
                open={openRow === "money"}
                onToggle={() => toggle("money")}
            >
                <div className="space-y-2.5">
                    {moneyGroups.map(group => (
                        <div key={group.id} className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2.5">
                            <div className="flex items-baseline justify-between gap-3">
                                <strong className="text-[13px] text-[var(--color-ink)]">{group.name}</strong>
                                <span className="shrink-0 text-[11px] text-[var(--color-ink-soft)]">
                                    {group.poolLabel}{" "}
                                    <span className="font-mono tabular-nums text-[var(--color-ink)]">{fmtMoney(group.pool)}</span>
                                </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono tabular-nums text-[11.5px] text-[var(--color-ink-soft)]">
                                {group.entries.map(entry => (
                                    <span key={entry.label} className={entry.empty ? "text-[var(--color-ink-muted)]" : ""}>
                                        {entry.label} {entry.value}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                    {/* NOTE for future edits: dining money is pooled house-wide across every
                        dining team and split by one point value (engine.js), so a wrong figure
                        moves everyone. Do not add copy here that attributes a person's payout
                        to one team's money - it cannot, and it would send the hunt the wrong way. */}
                    <FixJump label="Fix in Settle up" onClick={onFixMoney} />
                </div>
            </ReviewDisclosure>

            {/* The floor roster, for spotting someone who should not be on. */}
            <ReviewDisclosure
                title="Who's on the floor"
                meta={`${floorHeadcount} ${floorHeadcount === 1 ? "person" : "people"} · ${floorPoints} ${floorPoints === 1 ? "pt" : "pts"}`}
                open={openRow === "floor"}
                onToggle={() => toggle("floor")}
            >
                <div className="space-y-2.5">
                    {floorGroups.map(group => (
                        <div key={group.id} className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2.5">
                            <div className="flex items-baseline justify-between gap-3">
                                <strong className="text-[13px] text-[var(--color-ink)]">{group.name}</strong>
                                <span className="shrink-0 text-[11px] text-[var(--color-ink-soft)]">
                                    {group.members.length} {group.members.length === 1 ? "person" : "people"}
                                    {group.kind === "runners" ? null : <> · {group.points} {group.points === 1 ? "pt" : "pts"}</>}
                                </span>
                            </div>
                            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-ink-soft)]">
                                {group.members.length > 0 ? group.members.join(" · ") : "Nobody assigned"}
                            </p>
                        </div>
                    ))}
                    <FixJump label="Fix on the Floor plan" onClick={onFixFloor} />
                </div>
            </ReviewDisclosure>

            {/* Today's headline, demoted. It is not the comparison the captain came to
                make; it stays as one row because it costs one row and could surface a
                bad total before committing. */}
            <ReviewDisclosure
                title="Shift totals"
                meta={<>take-home <span className="font-mono tabular-nums">{fmtMoney(staffTotal)}</span></>}
                open={openRow === "totals"}
                onToggle={() => toggle("totals")}
            >
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--color-ink-muted)]">
                        <span className="uppercase tracking-wide">Available pool</span>
                        <span className="font-mono tabular-nums text-[var(--color-ink)]">{fmtMoney(poolAvailable)}</span>
                        <span className="font-mono">−</span>
                        <span className="uppercase tracking-wide">House / door</span>
                        <span className="font-mono tabular-nums text-[var(--color-ink)]">{fmtMoney(houseDoor)}</span>
                        <span className="font-mono">=</span>
                        <span className="uppercase tracking-wide">Staff take-home</span>
                        <span className="font-mono tabular-nums font-semibold text-[var(--color-accent)]">{fmtMoney(staffTotal)}</span>
                    </div>
                    {/* Cash is money too, but it is distributed separately and must never fold
                        into the pool total (CTP + GRT). Show the pool and cash as two clearly
                        separated figures so "Available" never means two different numbers. */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2.5">
                        <SummaryMetric label="Employees" value={payoutRows.length.toLocaleString()} />
                        <SummaryMetric label="Available pool" value={fmtMoney(poolAvailable)} />
                        <SummaryMetric label="Available cash" value={fmtMoney(availableCash)} />
                        <SummaryMetric label="Runner pay" value={fmtMoney(result.allocations?.totalRunnerPay)} />
                        <SummaryMetric label="Balance" value={fmtMoney(result.balances?.overallBalance)} />
                    </div>
                </div>
            </ReviewDisclosure>
        </div>
    );
}


// The floating action pair pinned to the bottom-right corner, shared by the Floor
// plan and Settle up editors so both screens enter/exit edit identically. Cancel is
// a neutral pill that never competes with the accent primary; each is its own 44px+
// tap target. (Single source of truth - do not fork a parallel FAB per screen.)
function EditorActionPair({ onCancel, onPrimary, primaryLabel, busy }) {
    return (
        <div className="fixed bottom-5 right-5 z-30 flex items-center gap-2.5">
            <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-3.5 text-sm font-semibold text-[var(--color-ink-soft)] shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-transform active:scale-95 disabled:opacity-60"
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={onPrimary}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95 disabled:opacity-60"
            >
                {primaryLabel}
            </button>
        </div>
    );
}

// A stable fingerprint of the editable shift (roster + money), ignoring transient
// UI-only fields like `_showContracts`. Comparing the live fingerprint to the one
// captured at load tells us whether the admin has actually changed anything - used
// to decide whether leaving edit mode needs a discard confirmation.
function fingerprintShift(teams, barTeam, runners) {
    return JSON.stringify({
        teams: (teams || []).map(team => ({
            teamId: team.teamId,
            members: team.members || [],
            pools: team.pools || {},
            contracts: team.contracts || [],
        })),
        barTeam: { members: barTeam?.members || [], pools: barTeam?.pools || {} },
        runners: runners || [],
    });
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
    // Settle up lands LOCKED: the money form is visible but its fields are disabled
    // until the admin taps the floating Edit. Done/Cancel re-lock in place (they do
    // not leave the settle screen). The group switcher stays tappable while locked.
    const [settleEditable, setSettleEditable] = useState(false);
    const [draftStatus, setDraftStatus] = useState("");
    // Fingerprint of the shift as loaded, so Cancel can tell an untouched view from
    // one with real edits and only confirm a discard when work would actually be lost.
    const loadedFingerprintRef = useRef("");
    // Snapshot of the money taken when Settle up is unlocked, so Cancel can revert to
    // exactly what was showing before this edit and truly discard the changes.
    const settleSnapshotRef = useRef(null);
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

    // Review's rung 2: every group's money exactly as it was typed at Settle up, all on
    // one screen. Settle up itself shows one group at a time, so this is the only place
    // the whole entry can be scanned for a typo in a single read.
    const reviewMoneyGroups = useMemo(() => {
        const moneyEntry = (label, value) => ({
            label,
            value: fmtAmount(value),
            empty: toMoney(value) === 0,
        });
        const teamGroups = teams.map((team, index) => {
            const pools = team.pools || {};
            const contracts = (team.contracts || []).filter(contract => toMoney(contract.gratuity) > 0);
            return {
                id: team.teamId,
                name: `Team ${index + 1}`,
                poolLabel: "pool",
                pool: poolSummary.teams[index]?.payoutPool ?? 0,
                entries: [
                    moneyEntry("CTP", pools.tips),
                    moneyEntry("GRT", pools.gratuity),
                    moneyEntry("Cash", pools.cash),
                    moneyEntry("Sales", pools.sales),
                    ...contracts.map((contract, contractIndex) => (
                        moneyEntry(`Contract ${contract.name || contractIndex + 1}`, contract.gratuity)
                    )),
                ],
            };
        });
        return [
            ...teamGroups,
            {
                id: "bar",
                name: "Bar Team",
                poolLabel: "pool",
                pool: poolSummary.bar.payoutPool,
                entries: [
                    moneyEntry("CTP", barTeam.pools?.tips),
                    moneyEntry("GRT", barTeam.pools?.gratuity),
                    moneyEntry("Sales", barTeam.pools?.sales),
                ],
            },
            {
                id: "runners",
                name: "Runners",
                poolLabel: "pay",
                pool: poolSummary.totalRunnerPay,
                entries: runners.length > 0
                    ? runners.map(runner => moneyEntry(runner.name || "Runner", runner.payoutAmount ?? RUNNER_FLAT_RATE))
                    : [{ label: "No runners", value: "", empty: true }],
            },
        ];
    }, [teams, barTeam, runners, poolSummary]);

    // Review's rung 3: the floor as it stands, for spotting someone who should not be on.
    const reviewFloorGroups = useMemo(() => {
        const memberNames = (members) => members.map(member => member.name || "Unknown");
        return [
            ...teams.map((team, index) => ({
                id: team.teamId,
                kind: "dining",
                name: `Team ${index + 1}`,
                members: memberNames(team.members),
                points: team.members.reduce((sum, member) => sum + toMoney(member.points), 0),
            })),
            {
                id: "bar",
                kind: "bar",
                name: "Bar Team",
                members: memberNames(barTeam.members),
                points: poolSummary.barPoints,
            },
            {
                id: "runners",
                kind: "runners",
                name: "Runners",
                members: memberNames(runners),
                points: 0,
            },
        ];
    }, [teams, barTeam, runners, poolSummary.barPoints]);

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

    // Settle up always (re-)enters locked: switching day-steps or loading a new day
    // returns the money form to its read-only view.
    useEffect(() => {
        setSettleEditable(false);
    }, [step, date]);

    useEffect(() => {
        const loadShift = async () => {
            try {
                setLoading(true);
                setHasLoadedShift(false);
                setDraftStatus("");
                setShiftStatus(null);
                const shiftDoc = await getDoc(doc(db, "shifts", date));
                const emptyTeams = [
                    { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
                ];
                const emptyBar = { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } };
                let nextTeams = emptyTeams;
                let nextBar = emptyBar;
                let nextRunners = [];
                if (shiftDoc.exists()) {
                    const d = shiftDoc.data();
                    if (d.teams) {
                        nextTeams = d.teams.map(t => ({
                            teamId: t.teamId,
                            members: t.members || [],
                            pools: t.pools || { sales: t.teamSales || "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" },
                            contracts: t.contracts || []
                        }));
                    }
                    if (d.barTeam) {
                        nextBar = {
                            members: d.barTeam.members || [],
                            pools: d.barTeam.pools || { sales: "", tips: "", gratuity: "", covers: "" }
                        };
                    }
                    if (d.runners) nextRunners = d.runners;
                    setShiftStatus(d.status || (d.summary || d.firstClosedAt || d.payouts ? "closed" : "setup"));
                }
                setTeams(nextTeams);
                setBarTeam(nextBar);
                setRunners(nextRunners);
                // Baseline the loaded shift so Cancel knows whether anything changed.
                loadedFingerprintRef.current = fingerprintShift(nextTeams, nextBar, nextRunners);
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
        // Pause autosave while Settle up is unlocked: in-progress money edits must not
        // persist until Done, so Cancel can restore the pre-edit snapshot and discard.
        if (!hasLoadedShift || loading || isSaving || shiftStatus === "closed" || settleEditable) return undefined;
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
        settleEditable,
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

    // PROTOTYPE (in-place edit): "Done" saves the floor and returns to the read-only
    // landing instead of advancing to Settle. Settle is reached from the day rail.
    const handleDoneFloor = async () => {
        const ok = await handleSaveTeamSetup();
        if (!ok) return;
        onClose();
    };

    // Settle up "Done": persist the entered money (as the shift's setup draft, the
    // same shape autosave writes) and RE-LOCK in place - stays on the Settle screen,
    // returning to the locked view. A closed shift instead takes the paid-out path
    // (Done -> Calculate -> Review -> Confirm & Save), so this only runs for a setup
    // shift; the closed case is wired to handleCalculateForReview on the button.
    const handleDoneSettle = async () => {
        if (isSaving) return;
        setIsSaving(true);
        setSaveStatus("Saving money…");
        try {
            await setDoc(doc(db, "shifts", date), buildShiftSetupDraft({
                date,
                teams,
                barTeam,
                runners,
                includeCloseoutDraft: true,
            }));
            setShiftStatus("setup");
            setSaveStatus("Money saved.");
            setSettleEditable(false);
        } catch (e) {
            console.error("Failed to save settle-up money:", e);
            setSaveStatus("Failed to save money.");
        } finally {
            setIsSaving(false);
        }
    };

    // Has the admin actually changed anything since the shift loaded?
    const isDirty = hasLoadedShift
        && loadedFingerprintRef.current !== ""
        && fingerprintShift(teams, barTeam, runners) !== loadedFingerprintRef.current;

    // Cancel: leave edit mode WITHOUT committing and return to the read-only landing.
    // onClose() re-reads the day, so nothing in-editor is written. A setup shift
    // autosaves its draft continuously, so leaving loses nothing and needs no prompt.
    // A closed shift disables autosave (edits only persist through Calculate Payouts ->
    // Confirm & Save), so an in-progress edit would be dropped - guard that with a
    // discard confirmation, matching the app's other lossy actions (Remove shift).
    const handleCancelEdit = () => {
        if (isSaving) return;
        const wouldDropWork = shiftStatus === "closed" && isDirty;
        if (wouldDropWork) {
            const confirmed = window.confirm(
                "Discard your changes to this closed shift?\n\n" +
                "Edits to a paid-out shift are only saved when you Calculate Payouts and " +
                "Confirm & Save Shift. Leaving now returns to the saved shift and keeps its " +
                "current payouts unchanged."
            );
            if (!confirmed) return;
        }
        onClose();
    };

    // Settle up "Edit": snapshot the money as it stands, then unlock the fields.
    // Autosave is paused while unlocked (see the draft effect), so nothing persists
    // until Done - which lets Cancel restore this snapshot and truly discard.
    const handleEditSettle = () => {
        settleSnapshotRef.current = { teams, barTeam, runners };
        setSettleEditable(true);
    };

    // Settle up "Cancel": discard the in-progress edits by restoring the snapshot from
    // when Edit was pressed, then re-lock in place (stay on the Settle screen). On a
    // closed shift, confirm first when there are real changes to drop.
    const handleCancelSettle = () => {
        if (isSaving) return;
        const snapshot = settleSnapshotRef.current;
        const changed = snapshot
            && fingerprintShift(teams, barTeam, runners)
                !== fingerprintShift(snapshot.teams, snapshot.barTeam, snapshot.runners);
        if (shiftStatus === "closed" && changed) {
            const confirmed = window.confirm(
                "Discard your changes to this closed shift's money?\n\n" +
                "Edits to a paid-out shift are only saved when you Calculate Payouts and " +
                "Confirm & Save Shift. Discarding keeps the saved payouts unchanged."
            );
            if (!confirmed) return;
        }
        if (snapshot) {
            setTeams(snapshot.teams);
            setBarTeam(snapshot.barTeam);
            setRunners(snapshot.runners);
        }
        setSaveStatus("");
        setSettleEditable(false);
    };

    // Day rail step navigation (Floor -> Settle -> Review). Earlier steps are always
    // reachable; Review is only reachable once payouts have been calculated. (The old
    // "Pay out" pill that exited to the landing was removed - the side nav / save
    // flows already return there.)
    const goToStep = (key) => {
        if (key === "review" && !calculatedReview) {
            // A saved shift already has payouts, so tapping Review goes straight there
            // rather than dead-ending until you detour through Settle up. The payouts
            // are recomputed from the shift's own saved inputs by the same pure
            // `calculateShift` the Calculate button runs - it writes nothing, and
            // Confirm & Save is still the only thing that persists anything.
            if (shiftStatus === "closed") handleCalculateForReview();
            return;
        }
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

    // Effective step guards a stray "review" with no calculation behind it.
    const effectiveStep = step === "review" && !calculatedReview ? "settle" : step;

    // The editing "layer" (accent frame + "Editing" strip) is active on the floor and
    // review steps, and on Settle up only once it is unlocked. A locked Settle up reads
    // as a neutral, read-only view.
    const isEditingLayer = effectiveStep === "settle" ? settleEditable : true;
    // Closed-shift money steps keep their warning frame, so the accent editing frame
    // shows only when we are in the editing layer and not on a closed money step.
    const showEditFrame = isEditingLayer && !(shiftStatus === "closed" && effectiveStep !== "floor");

    // Day-level step status for the rail. Status is always shown; order is never
    // hard-forced - any earlier/reachable step is one tap away.
    const railSteps = getRailSteps({
        activeStep: effectiveStep,
        shiftStatus,
        hasCalculatedReview: Boolean(calculatedReview),
    });

    // Floor and Review both fill the phone screen rather than shrink-wrapping their
    // content. On Review that is what puts the floating save button INSIDE the card
    // instead of leaving it hovering over the page below a short panel. Content still
    // packs snug at the top - the panel grows, the rows do not spread out.
    const isFullHeightStep = effectiveStep === "floor" || effectiveStep === "review";

    return (
        <div className={"space-y-3 sm:space-y-4" + (isFullHeightStep ? " max-[560px]:flex max-[560px]:flex-col max-[560px]:min-h-[calc(100dvh-6rem)]" : "")}>
            {/* The day rail: an ordered, day-level step spine. Status is always
                shown; earlier/reachable steps are one tap away (order never forced). */}
            <DayRail steps={railSteps} onStepClick={goToStep} />

            {/* Edit mode reads as a distinct layer: an accent stroke + soft accent
                elevation lifts the workspace off the page, versus the plain bordered
                cards of the read-only landing. A settled shift's money steps (settle /
                review) keep a neutral frame so the accent never competes with their
                warning styling, but its FLOOR step gets the same accent editing frame
                as a setup shift (v3: identical in-place edit look). */}
            <Card className={"!p-0 " + (showEditFrame
                ? "ring-2 ring-[var(--color-accent)]/25 shadow-[0_10px_30px_rgba(47,111,79,0.10)]"
                : "")
                + (isFullHeightStep ? " max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0" : "")}>
                <header className="hidden sm:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-line)]">
                    <div className="flex flex-col gap-1">
                        <h2 className="font-display text-base sm:text-lg font-medium tracking-tight text-[var(--color-ink)]">
                            Shift Workspace - {date}
                        </h2>
                        {(shiftStatus === "closed" && effectiveStep !== "floor") ? (
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                Closed shift
                            </span>
                        ) : (
                            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
                                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                                Editing
                            </span>
                        )}
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
                    always-visible strip. Non-closed shows an accent "Editing floor plan"
                    cue (matching the workspace's accent frame) so it is clear you are in
                    the editing layer, not the read-only floor view. */}
                {(shiftStatus === "closed" && effectiveStep !== "floor") ? (
                    <div className="sm:hidden flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--color-warning)]/25 bg-[var(--color-warning-soft)]">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-warning)]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                            Closed shift · Paid out
                        </span>
                        <span className="text-[11px] tabular-nums text-[var(--color-warning)]/80">{date}</span>
                    </div>
                ) : isEditingLayer ? (
                    <div className="sm:hidden flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)]">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-accent)]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                            {effectiveStep === "settle"
                                ? "Editing · Settle up"
                                : effectiveStep === "review"
                                    ? "Editing · Review"
                                    : "Editing floor plan"}
                        </span>
                    </div>
                ) : (
                    // Locked Settle up: a neutral view header, not an editing cue -
                    // tap the floating Edit button to change the money.
                    <div className="sm:hidden flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-line)] bg-[var(--color-surface-muted)]/60">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-soft)]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-ink-muted)]" />
                            Settle up
                        </span>
                    </div>
                )}

                {loading ? (
                    <div className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
                        Loading shift data…
                    </div>
                ) : (
                    <div className={"p-3 sm:p-6" + (isFullHeightStep ? " max-[560px]:flex-1 max-[560px]:flex max-[560px]:flex-col max-[560px]:min-h-0" : "")}>
                        {/* The Day Rail above names the active step, so no duplicate
                            step heading is rendered here. */}

                        {/* Not on Review. There the messages are the engine's own validations,
                            which the captain already passed through on the way here, and the
                            block is tall enough to push the spot-check card - the one thing
                            Review exists for - off the top of a phone screen. Floor and Settle
                            up still show it, because there it carries the errors that block a
                            save and it sits above the fields those errors name. Review's own
                            save progress/failure surfaces inline next to its save button. */}
                        {validationMessages.length > 0 && effectiveStep !== "review" ? (
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
                            <div className="max-[560px]:flex-1 max-[560px]:flex max-[560px]:flex-col max-[560px]:min-h-0">
                                {/* PROTOTYPE v3: identical in-place editor for setup AND settled
                                    shifts - the redesigned cards are always editable (the entry
                                    was an explicit "Edit"; autosave is disabled for closed shifts
                                    so nothing persists until the confirmed save below). */}
                                <ShiftSetupDnd
                                    allEmployees={allEmployees}
                                    teams={teams} setTeams={setTeams}
                                    barTeam={barTeam} setBarTeam={setBarTeam}
                                    runners={runners} setRunners={setRunners}
                                    readOnly={false}
                                />
                                {/* Floating action pair (shared with Settle up). Cancel leaves edit
                                    mode WITHOUT saving and returns to the read-only floor view; Done
                                    commits. For a setup shift Done saves the draft and returns; for a
                                    settled/paid shift it routes into the EXISTING overwrite-confirmed
                                    save (handleCalculateForReview -> Review with the "Re-saving
                                    overwrites the saved payouts for {date}" warning + Confirm & Save).
                                    Nothing is written until that explicit confirm. */}
                                <EditorActionPair
                                    onCancel={handleCancelEdit}
                                    onPrimary={shiftStatus === "closed" ? handleCalculateForReview : handleDoneFloor}
                                    primaryLabel={isSaving ? "Saving…" : "✓ Done"}
                                    busy={isSaving}
                                />
                            </div>
                        ) : effectiveStep === "settle" ? (
                            /* STEP 2 - Settle up: the calm single money switcher, edited in place and
                               saved with the same bottom-right FAB as the floor plan. */
                            <section className="space-y-4 max-[560px]:pb-24">
                                {/* Team switcher: a compact horizontal strip above one fixed-height entry
                                    panel. Tapping a pill focuses that group; the strip scrolls sideways on
                                    phone so page height stays constant no matter how large the roster is.
                                    A status line + edge fade keep off-screen groups and their money status
                                    discoverable instead of a blind sideways swipe. */}
                                <div className="flex items-center justify-between gap-3">
                                    <span className="inline-flex items-baseline gap-2">
                                        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                                            {groupStatusSummary.total} {groupStatusSummary.total === 1 ? "group" : "groups"} · Pool
                                        </span>
                                        <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                                            {fmtMoney(poolSummary.payoutPool)}
                                        </strong>
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

                                {/* Locked view = these very same fields, disabled. A native
                                    disabled fieldset switches every input/stepper off at once; Edit
                                    flips it back on in place. The group switcher above stays outside
                                    the fieldset so you can still page through each group while locked. */}
                                <fieldset disabled={!settleEditable} className="m-0 min-w-0 border-0 p-0">
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
                                </fieldset>

                                {/* A closed shift disables draft autosave, so surface the live save/
                                    draft status inline; a setup shift's money autosaves silently. */}
                                {(saveStatus || draftStatus) ? (
                                    <p aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">
                                        {saveStatus || draftStatus}
                                    </p>
                                ) : null}

                                {settleEditable ? (
                                    /* Editing: the floor plan's floating pair. Cancel re-locks without
                                       saving; Done saves the money and re-locks in place (a closed shift
                                       instead takes the paid-out path: Done -> Calculate -> Review). */
                                    <EditorActionPair
                                        onCancel={handleCancelSettle}
                                        onPrimary={shiftStatus === "closed" ? handleCalculateForReview : handleDoneSettle}
                                        primaryLabel={isSaving ? "Saving…" : "✓ Done"}
                                        busy={isSaving}
                                    />
                                ) : (
                                    <>
                                        {/* Locked view: Calculate Payouts stays available so the shift
                                            can always advance to Review -> Confirm & Save without
                                            unlocking, and the single floating Edit button unlocks the
                                            very same fields for changes. */}
                                        <Button
                                            onClick={handleCalculateForReview}
                                            disabled={isSaving}
                                            size="lg"
                                            className="w-full"
                                        >
                                            Calculate Payouts →
                                        </Button>
                                        <button
                                            type="button"
                                            onClick={handleEditSettle}
                                            className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95"
                                        >
                                            ✎ Edit
                                        </button>
                                    </>
                                )}
                            </section>
                        ) : (
                            /* STEP 3 - Review -> Confirm & Save. The payout list used to live
                               in a `max-h-96 overflow-y-auto` box nested inside the page
                               scroll, so its last rows were silently clipped with no cue that
                               the container scrolled; everything now flows in the page. There
                               is no "Back to Settle up" button - the "Fix in Settle up" and
                               "Fix on the Floor plan" jumps inside the rows below already do
                               that, from the place that explains why you would go. The bottom
                               padding is the floating save button's clearance, exactly as
                               Settle up does it. */
                            <section className="space-y-4 pb-24 sm:mx-auto sm:max-w-lg max-[560px]:flex-1">
                                <CalculatedPayoutReview
                                    review={calculatedReview}
                                    poolAvailable={poolSummary.payoutPool}
                                    availableCash={poolSummary.totalCash}
                                    moneyGroups={reviewMoneyGroups}
                                    floorGroups={reviewFloorGroups}
                                    floorPoints={poolSummary.restaurantPoints + poolSummary.barPoints}
                                    onFixMoney={() => setStep("settle")}
                                    onFixFloor={() => setStep("floor")}
                                />

                                {shiftStatus === "closed" ? (
                                    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--color-warning)]">
                                        <span aria-hidden="true">⚠</span>
                                        <span>Re-saving overwrites the saved payouts for {date}.</span>
                                    </p>
                                ) : null}

                                {/* The step's warnings block is suppressed above, so this inline
                                    line is the only channel left for save progress and failure. */}
                                {(saveStatus || draftStatus) ? (
                                    <p aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">
                                        {saveStatus || draftStatus}
                                    </p>
                                ) : null}

                                {/* Same floating primary as the Floor plan and Settle up: one
                                    accent pill, bottom-right, always in reach without scrolling. */}
                                <button
                                    type="button"
                                    onClick={handleConfirmSave}
                                    disabled={isSaving}
                                    className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95 disabled:opacity-60"
                                >
                                    {isSaving ? "Saving…" : "✓ Confirm & Save Shift"}
                                </button>
                            </section>
                        )}
                    </div>
                )}
            </Card>

        </div>
    );
}

export default ShiftEditorPanel;
