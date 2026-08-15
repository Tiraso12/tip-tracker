import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { calculateShift } from "../../utils/engine";
import ShiftSetupDnd from "./ShiftSetup/ShiftSetupDnd";
import NegativeNightNotice from "./NegativeNightNotice";
import DayRail from "./DayRail";
import FloatingActions from "./FloatingActions";
import ScrollRail from "./ScrollRail";
import { getRailSteps } from "../../utils/dayFlow";
import { getGroupMoneyStatus, summarizeGroupStatuses } from "../../utils/settleStatus";
import { Card, Spinner } from "../ui";
import { saveClosedShiftAtomically } from "../../utils/closeoutPersistence";
import { buildShiftSetupDraft } from "../../utils/shiftPersistence";
import { ROLE_POINTS, RUNNER_FLAT_RATE } from "../../utils/constants";
import { getHistoryFlagUpdate, getShiftParticipantUids } from "../../utils/userHistoryFlags";
import { useAuth } from "../../context/AuthContext";
import { usePendingActions } from "../../context/PendingActionsContext";
import {
    applyBarFoodSalesEdit,
    buildPayoutReview,
    fmtAmount,
    fmtMoney,
    getBarSummary,
    getPayoutNonCashTotal,
    getTeamSummary,
    ignoreMissingUserDoc,
    isNegativeMoney,
    isRunnersFeeDerived,
    isRunnersFeeOverridden,
    mapPayoutsForFirebase,
    selectSpotCheckSubject,
    toMoney,
    validateShiftInputs,
    validateTeamSetup,
    withoutNegativePoolWarnings,
} from "./shiftEditorUtils";
import { roleLabel } from "../../utils/roleLabels";
import { applyOpenShiftMemberNames } from "../../utils/accountProfilePersistence";
import { describeShiftBalance } from "../../utils/shiftBalance";
import { describeSaveFailure, findNamelessParticipants } from "../../utils/saveFailure";
import { getExternalFeeTotal } from "../../utils/payoutLedger";

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

// `badge` rides on the label line and `note` sits under the input. Both exist for one
// field - the bar's Runners Fee, which is derived from food sales and says so - so they
// are deliberately plain slots rather than a derivation-aware field: nothing else on a
// settle card should grow chrome because that one field needed it.
function PoolField({ label, value, onChange, money = true, badge = null, note = null }) {
    const id = `pool-field-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return (
        <div className="flex flex-col gap-1.5">
            {/* Fixed-height label line. A badge is taller than the label text, and these
                fields sit side by side in a grid row - left to grow, the one field
                carrying a badge would push its input a few pixels below its neighbour's
                and break the row the whole card is read across. */}
            <div className="flex h-4 items-center gap-1.5 min-w-0">
                <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-soft)]">
                    {label}
                </label>
                {badge}
            </div>
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
            {note ? (
                <span className="text-[10.5px] leading-snug text-[var(--color-ink-muted)]">{note}</span>
            ) : null}
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
                // On a phone these are TABS, not pills: no box of their own, just a word
                // and its figure with the active one underlined. A drawn rectangle per
                // group competed with the entry surface below for the same attention, and
                // shape now separates the two navigations - the Day Rail's steps stay
                // boxed, the group switcher does not. ScrollRail's edge fade and "›" keep
                // off-screen groups discoverable, which is what a border used to hint at.
                "max-[560px]:rounded-none max-[560px]:border-transparent max-[560px]:bg-transparent max-[560px]:px-2.5 " +
                "transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                (selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[inset_0_-2px_0_var(--color-accent)] "
                      + "max-[560px]:bg-transparent max-[560px]:shadow-[inset_0_-3px_0_var(--color-accent)]"
                    : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-line-strong)]")
            }
        >
            <span className={"text-[13px] font-semibold whitespace-nowrap " + (selected ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]")}>
                {group.name}
            </span>
            {/* On a phone a tab is the team's NAME and nothing else. Carrying the pool
                here made every tab as wide as its figure, which is what pushed the third
                group off the edge, and a switcher is a place you choose from rather than
                a place you read money from. The figure needs a home of its own on the
                phone - until it has one it is not shown there at all.

                Desktop keeps it: the pills are not width-constrained there, and the
                selected one prints to the cent because a rounded pool on a screen with
                room for the real one is just a less useful number. */}
            <span className={"font-mono tabular-nums whitespace-nowrap max-[560px]:hidden " + (selected ? "text-[12.5px] text-[var(--color-accent)]" : "text-[11.5px] text-[var(--color-ink-soft)]")}>
                {group.poolLabel === "Pay" ? "Pay " : ""}{selected ? fmtMoney(group.pool) : "$" + Math.round(group.pool).toLocaleString()}
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
//
// On a phone the panel FILLS the screen down to the floating action's clearance and its
// BODY is what scrolls; the page behind it does not. The money fields used to run off the
// bottom of a shrink-wrapped panel, so reaching Cash or Covers meant scrolling the whole
// page and pushing the group switcher - the control that says which team's money you are
// typing - off the top. On a phone the group name and its pool live on the selected
// switcher pill, which is pinned above and carries the exact figure.
//
// The panel draws NO box of its own on a phone: the editor Card is the only frame, so a
// money field is inside two frames instead of three and gains its width back. On desktop
// the box stays - there the panel sits beside other content and needs its own edge.
// Tracks whether a scrolling element has more content below the fold, so the
// panel can say so. Returns false the moment the last pixel is reached, and
// re-measures on resize and on content changes (a disclosure opening changes the
// answer without any scrolling happening).
function useHasMoreBelow(ref) {
    const [more, setMore] = useState(false);

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const next = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
        setMore((prev) => (prev === next ? prev : next));
    }, [ref]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        measure();
        el.addEventListener("scroll", measure, { passive: true });
        window.addEventListener("resize", measure);
        // The fields themselves change height (contracts / point-split disclosures),
        // so watching the scroller alone would miss the case that matters most.
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => {
            el.removeEventListener("scroll", measure);
            window.removeEventListener("resize", measure);
            ro.disconnect();
        };
    }, [measure, ref]);

    return more;
}

function CloseoutEntryPanel({ group, children }) {
    const bodyRef = useRef(null);
    const hasMoreBelow = useHasMoreBelow(bodyRef);

    return (
        <div className="border border-[var(--color-line-strong)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden shadow-[0_6px_20px_rgba(15,23,42,0.05)] max-[560px]:border-0 max-[560px]:rounded-none max-[560px]:shadow-[none] max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0">
            {/* The selected switcher pill directly above already names the group, so
                printing it again in the head said the same word twice on one screen, and
                on a phone that head is hidden outright. The name stays in the accessibility
                tree here - outside the head, so it survives that hiding - because which
                pill is selected is not something a screen reader user landing inside the
                panel already knows. */}
            <span className="sr-only">{group.name}</span>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line)] max-[560px]:hidden">
                <div className="flex flex-col gap-0.5 min-w-0">
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
            {/* The scroller and its cue share a relative box so the cue can sit on the
                panel's bottom edge without scrolling away with the fields. */}
            <div className="relative max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0">
                <div
                    ref={bodyRef}
                    className="p-4 max-[560px]:px-0 max-[560px]:pt-3.5 max-[560px]:pb-14 max-[560px]:flex-1 max-[560px]:min-h-0 max-[560px]:overflow-y-auto max-[560px]:overscroll-contain"
                >
                    {children}
                </div>
                {/* "There is more money below this fold." The panel now runs to the bottom
                    of the card, which reads as an ending, so without this the last field
                    on screen looks like the last field there is - and a Runners Fee nobody
                    scrolls to is a Runners Fee nobody enters. Matches the horizontal cue on
                    the group switcher: a fade the content dissolves into, plus a chevron.
                    Hidden the instant the end is reached, and never shown on desktop, where
                    the body does not scroll. */}
                {hasMoreBelow ? (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center"
                        style={{ backgroundImage: "linear-gradient(to top, var(--color-surface) 45%, transparent)" }}
                    >
                        {/* A chip, not a bare glyph: at the foot of a white panel a lone
                            chevron in muted grey is exactly what the eye skips. The border
                            gives it an edge to catch on without it reading as a button -
                            it is `pointer-events-none`, the panel itself is what scrolls. */}
                        <span className="mb-2 inline-flex h-6 items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-soft)] shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                            More <span aria-hidden="true" className="text-[11px] leading-none">⌄</span>
                        </span>
                    </div>
                ) : null}
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

// The one signal the captain asked for on the Runners Fee: this amount was set by
// hand, not derived. Nothing more - no history, no who-and-when, no diff against the
// computed figure. A fee sitting at 3% of food sales is the norm and stays silent,
// because marking every ordinary shift would be noise rather than information.
function EditedBadge() {
    return (
        <span
            className="inline-flex h-[15px] items-center rounded-full bg-[var(--color-warning-soft)] px-1.5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.06em] text-[var(--color-warning)]"
            title="Set by hand - this is not 3% of the food sales entered"
        >
            Edited
        </span>
    );
}

// Money inputs for the bar pool. Rendered inside the single entry panel.
//
// Food Sales and Runners Fee are a PAIR and are laid out as one: the fee is 3% of the
// bar's food sales, prefilled from the field beside it. Only the fee is money that
// moves - it comes off the bar's CTP and lands on the dining pool, exactly as it did
// when it was typed blind (engine.js §6). Food sales is context that funds nothing,
// which is why the engine records it and spends none of it.
function BarPoolFields({ barTeam, onBarPoolChange, onBarFoodSalesChange }) {
    const pools = barTeam.pools || {};
    const overridden = isRunnersFeeOverridden(pools);
    const derived = isRunnersFeeDerived(pools);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <PoolField label="Bar Sales" value={pools.sales} onChange={(value) => onBarPoolChange("sales", value)} />
            <PoolField label="Tips (CTP)" value={pools.tips} onChange={(value) => onBarPoolChange("tips", value)} />
            <PoolField label="Gratuity" value={pools.gratuity} onChange={(value) => onBarPoolChange("gratuity", value)} />
            <PoolField label="Covers" money={false} value={pools.covers} onChange={(value) => onBarPoolChange("covers", value)} />
            <PoolField
                label="Food Sales"
                value={pools.foodSales}
                onChange={onBarFoodSalesChange}
                note="The bar's total food sales. The Runners Fee is 3% of it."
            />
            <PoolField
                label="Runners Fee"
                value={pools.runners}
                onChange={(value) => onBarPoolChange("runners", value)}
                badge={overridden ? <EditedBadge /> : null}
                // The amount is the field, so the note never argues with what is typed:
                // it says where the number came from while it is still the derived 3%,
                // and steps back once someone has set their own rate.
                note={derived
                    ? "3% of food sales. Edit the amount to use a different rate."
                    : overridden
                        ? "Set by hand - not 3% of the food sales entered."
                        : "Enter food sales above to fill this at 3%."}
            />
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
function SpotCheckRow({ label, sub, value, rule = "hairline", emphasis = false, testId }) {
    const ruleClass = rule === "total"
        ? "border-b-2 border-[var(--color-ink)]/70"
        : rule === "none"
            ? ""
            : "border-b border-[var(--color-line)]";
    return (
        <div data-testid={testId} className={"flex items-baseline justify-between gap-4 px-4 py-3 min-h-[44px] " + ruleClass}>
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
                    {roleLabel(payout.role)}
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
                            testId="spot-check-total"
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
// Everything inside is READ-ONLY. Review derives from the live floor plan and money
// (ShiftEditorPanel `liveReview`), so an edit made here would recompute the very card
// above it under the captain's eyes. Diagnosis happens in these rows; each offers one
// jump out to the screen where writes belong, and the numbers are already current when
// you come back.
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

// One row of the Shift totals ledger. Label left, figure right, both on the same
// baseline so the column of money reads straight down at a glance. `tone="warn"`
// is for a row that should stop a captain committing - it carries the warning
// colour on BOTH the label and the figure, because a ledger scanned down its money
// column would otherwise never register a colour change on the label alone.
function LedgerRow({ label, sub, value, tone = "plain", testId }) {
    const isTotal = tone === "total";
    const isWarn = tone === "warn";
    return (
        <div className={"flex items-baseline justify-between gap-3 " + (isTotal ? "pt-2" : "")}>
            <span className="min-w-0">
                <span className={isTotal
                    ? "text-[12px] font-semibold text-[var(--color-ink)]"
                    : isWarn
                        ? "text-[12px] font-semibold text-[var(--color-warning)]"
                        : "text-[12px] text-[var(--color-ink-soft)]"}>
                    {label}
                </span>
                {sub ? (
                    <span className={"block text-[10.5px] leading-tight "
                        + (isWarn ? "text-[var(--color-warning)]" : "text-[var(--color-ink-muted)]")}>
                        {sub}
                    </span>
                ) : null}
            </span>
            <strong
                data-testid={testId}
                className={"shrink-0 font-mono tabular-nums "
                    + (isTotal
                        ? "text-[15px] font-semibold text-[var(--color-ink)]"
                        : isWarn
                            ? "text-[12.5px] font-semibold text-[var(--color-warning)]"
                            : "text-[12.5px] font-normal text-[var(--color-ink-soft)]")}>
                {value}
            </strong>
        </div>
    );
}

function CalculatedPayoutReview({
    review,
    poolAvailable,
    barPoolEntered = 0,
    runnersFeeTransfer = 0,
    availableCash = 0,
    balanceBlocked = false,
    warnings = [],
    moneyGroups = [],
    floorGroups = [],
    floorPoints = 0,
    onFixMoney,
    onFixFloor,
}) {
    const { result, payoutRows, staffTotal } = review;
    // See `withoutNegativePoolWarnings`: display-only, and the count beside "Shift totals"
    // has to be filtered with the list or the row promises a warning that is not inside.
    const visibleWarnings = withoutNegativePoolWarnings(warnings);

    // ---- The three genuinely separate destinations the engine pays into. ----
    // Split straight off `payoutRows` (the same rows the spot-check card reads), so
    // these can never drift from the per-person figures shown above them.
    //
    // The engine keeps dining and bar as SEPARATE pools with separate point values:
    // dining splits `adjustedTeamCTPPool`/`adjustedTeamGRTPool` over `totalAllTeamPoints`
    // (bartenders excluded), bar splits `adjustedBarCTPPool`/`adjustedBarGRTPool` over
    // `totalBarPoints` (engine.js §8/§10). Verified: adding $1,000 to bar tips moves bar
    // take-home by $1,000 and dining by exactly $0.00. Any figure here that merges them
    // is a presentation choice, never the engine's model - so nothing labelled "floor"
    // may contain bar money.
    const barTake = payoutRows
        .filter(payout => payout.role === "bartender")
        .reduce((sum, payout) => sum + getPayoutNonCashTotal(payout), 0);
    const runnerTake = payoutRows
        .filter(payout => payout.role === "runner")
        .reduce((sum, payout) => sum + getPayoutNonCashTotal(payout), 0);
    const diningTake = staffTotal - barTake - runnerTake;

    // The pool and the staff take-home read as two competing "totals"; the gap between
    // them is a RESIDUAL, and it is not all house/door.
    //
    // It used to be printed whole as "− House / door · leaves staff", which made that
    // one row absorb any stranded money and state it as the house's cut - on the shift
    // that exposed this the real door cut was $50 and the row read $150, quietly folding
    // in $100 that went nowhere. Because the row was derived by subtraction the ledger
    // always added up, so a real discrepancy could never surface here. What the house
    // actually took and what reached nobody are two different facts, so they get two rows.
    //
    // The genuine cut is the engine's own external-fee allocations (door CTP off
    // regular sales, door GRT / PE coordinator / house off contract sales) - the same
    // figure `reconcilePayoutLedger` strips out to find staff money. Everything left
    // over after subtracting it is unaccounted for, and equals the shift's
    // `overallBalance` less any stranded CASH (cash is on its own side of the books and
    // never enters this non-cash pool ledger) - verified on the no-captain, empty-bar,
    // cash-with-nobody and fully-balanced shifts.
    //
    // Deliberately NOT clamped at zero. Clamping a negative to $0.00 would print an
    // equation that does not add up - the exact "confident wrong number" this footer
    // exists to catch. An over-distributed shift shows a negative, which is the truth.
    //
    // House/door is entirely DINING-side: every component is computed from team sales
    // and subtracted from the dining pools only - `rawBarCTPPool` never sees it
    // (engine.js §2 PRE-DISTRIBUTIONS / §4 TEAM POOLS). So it belongs on the dining
    // side of any split ledger, never against the combined pool.
    const houseDoorResidual = (Number(poolAvailable) || 0) - staffTotal;
    const houseDoorCut = getExternalFeeTotal(result);
    const unaccountedFor = houseDoorResidual - houseDoorCut;
    const hasUnaccountedMoney = Math.abs(unaccountedFor) >= 0.005;
    // The bar's cut of the dining room's money: 1% of regular sales off the dining CTP
    // pool and 1% of contract sales off the dining GRT pool, both added straight onto
    // the bar pools. A real transfer BETWEEN the two sides, so it is a subtraction on
    // the dining ledger and an addition on the bar ledger - never a deduction from the
    // combined total, which it does not change.
    const barAllocation = (Number(result.allocations?.barCTPAllocation) || 0)
        + (Number(result.allocations?.barGRTAllocation) || 0);

    // Each side's own entered pool. Both ledgers below close exactly against the
    // engine's payouts (verified on the seeded shift and on the captain's 2026-08-12):
    //   dining: entered − house/door − runners − barAllocation + runnersFee = diningTake
    //   bar:    entered + barAllocation − runnersFee                        = barTake
    const diningPoolEntered = (Number(poolAvailable) || 0) - (Number(barPoolEntered) || 0);
    const feeTransfer = Number(runnersFeeTransfer) || 0;

    const overallBalance = Number(result.balances?.overallBalance) || 0;
    const balanced = Math.abs(overallBalance) <= 0.05;
    // One row open at a time: the spot-check card is the point of the screen and must
    // not be pushed off the top by two expanded blocks at once. When the shift cannot
    // be saved, Shift totals IS the point of the screen - the notice above says why and
    // this is where the balance check lives - so it starts open rather than making the
    // captain hunt for the number the notice just named.
    const [openRow, setOpenRow] = useState(balanceBlocked ? "totals" : null);
    const subject = selectSpotCheckSubject(payoutRows);
    const floorHeadcount = floorGroups.reduce((sum, group) => sum + group.members.length, 0);
    const toggle = (row) => setOpenRow(current => (current === row ? null : row));

    return (
        <div className="space-y-2.5">
            {subject ? <SpotCheckCard subject={subject} /> : null}

            {/* Directly under the person the screen is about, and deliberately NOT up
                with the blockers above: a negative payout is a true state of the night,
                not a reason the shift will not save. It never withholds the save.
                It reports the negative POOLS as well as the negative people, which is
                what let the engine's "…CTP pool is negative" strings come out of the
                red warnings row below. */}
            <NegativeNightNotice payoutRows={payoutRows} adjustedPools={result?.adjustedPools} />

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
                                    {group.kind === "runners"
                                        ? (group.members.length > 0
                                            ? <> · <span className="font-mono tabular-nums text-[var(--color-ink)]">{fmtMoney(group.pay)}</span> off the pool</>
                                            : null)
                                        : <> · {group.points} {group.points === 1 ? "pt" : "pts"}</>}
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

            {/* Today's headline, demoted but deliberately ordered. This footer is the only
                pre-commit sight of a bad total, so it earns its row - but the old flat grid
                (Employees / Available pool / Available cash / Runner pay / Balance) dumped
                five equal-weight figures with no answer to "which one am I checking?".

                THE RULE THIS SECTION EXISTS TO HOLD: dining and bar are SEPARATE POOLS in
                the engine - dining splits its pool over `totalAllTeamPoints` (bartenders
                excluded), the bar splits its own over `totalBarPoints` (engine.js S8/S10).
                Verified: +$1,000 of bar tips moves bar take-home by $1,000 and dining by
                exactly $0.00. So no figure here may put bar money inside a floor-labelled
                number, and no total may merge the two silently. A previous version of this
                block called `staffTotal - runners` "Split among the floor" - on a real
                shift that read $626.38 when the bar was $352.23 of it. Do not reintroduce
                a floor-sounding label over any combined figure. */}
            <ReviewDisclosure
                title="Shift totals"
                meta={visibleWarnings.length > 0
                    ? (
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-warning)]">
                            <span aria-hidden="true">⚠</span>
                            {visibleWarnings.length} {visibleWarnings.length === 1 ? "warning" : "warnings"}
                        </span>
                    )
                    : <>paid out <span className="font-mono tabular-nums">{fmtMoney(staffTotal)}</span></>}
                open={openRow === "totals"}
                onToggle={() => toggle("totals")}
            >
                <div className="space-y-3">
                    {/* The dining ledger, then the three destinations it resolves into.
                        There is deliberately NO parallel bar ledger: the captain's call,
                        and a correct one - the footer below already names dining take-home,
                        bar take-home and runners, so a second column deriving the bar would
                        state the same figure twice. What the bar needs from this ledger is
                        the transfer pair, and both legs are visible here as dining-side
                        movements ("− To the bar", "+ Runners fee"). */}
                    <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2.5 space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                            Dining room
                        </span>
                        <LedgerRow label="Pool entered" value={fmtMoney(diningPoolEntered)} />
                        <LedgerRow label="− House / door" sub="leaves staff" value={fmtMoney(houseDoorCut)} testId="totals-house-door" />
                        {hasUnaccountedMoney ? (
                            <LedgerRow
                                label="− Unaccounted for"
                                sub={unaccountedFor > 0 ? "reaches nobody" : "paid out beyond the pool"}
                                value={fmtMoney(unaccountedFor)}
                                tone="warn"
                                testId="totals-unaccounted"
                            />
                        ) : null}
                        <LedgerRow label="− Runners" sub="paid off the top" value={fmtMoney(runnerTake)} />
                        <LedgerRow label="− To the bar" sub="bar allocation" value={fmtMoney(barAllocation)} />
                        <LedgerRow label="+ Runners fee" sub="from the bar" value={fmtMoney(feeTransfer)} />
                        <div className="border-t border-[var(--color-line)]" />
                        <LedgerRow label="= Dining take-home" value={fmtMoney(diningTake)} tone="total" testId="totals-dining-ledger" />
                    </div>

                    {/* Intent option 1: an all-in total that is ALWAYS decomposed and is
                        never called the floor. The three rows are the engine's three real
                        destinations - dining pool, bar pool, runners - so the combined
                        figure can never read as one pooled split. Keeping it is what lets
                        the balance check below mean anything: the engine reconciles
                        `totalAvailable − totalDistributed` across all three, so dropping
                        the combined number would leave "✓ Balanced" anchored to nothing. */}
                    <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] px-3 py-2.5 space-y-1.5">
                        <LedgerRow label="Dining take-home" sub="split by dining points" value={fmtMoney(diningTake)} testId="totals-dining" />
                        <LedgerRow label="Bar take-home" sub="its own pool, split by bar points" value={fmtMoney(barTake)} testId="totals-bar" />
                        <LedgerRow label="Runners" sub="flat, off the dining pool" value={fmtMoney(runnerTake)} testId="totals-runners" />
                        <div className="border-t border-[var(--color-line)]" />
                        <LedgerRow label="= Everyone paid" sub="all three pools, CTP + GRT" value={fmtMoney(staffTotal)} tone="total" testId="totals-everyone-paid" />
                    </div>

                    {/* Tier 3 - the cross-checks. Cash is money too, but it is distributed
                        separately and must never fold into the pool total (CTP + GRT); it
                        sits here because unlike every derived figure above it is a number
                        the captain typed, so it is the one worth checking against reality. */}
                    <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2.5 space-y-2">
                        <LedgerRow
                            label="Available cash"
                            sub="you entered this - check it against the drawer"
                            value={fmtMoney(availableCash)}
                        />
                        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-2">
                            <span className="text-[12px] text-[var(--color-ink-soft)]">Balance check</span>
                            {balanced ? (
                                <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-accent)]">
                                    <span aria-hidden="true">✓</span> Balanced
                                </span>
                            ) : (
                                <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-warning)]">
                                    <span aria-hidden="true">⚠</span> Off by{" "}
                                    <span className="font-mono tabular-nums">{fmtMoney(Math.abs(overallBalance))}</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* The engine's own warnings. The numbers are complete (or this screen
                        would be showing ReviewNotReady instead), but these are the things
                        that should stop a captain from committing - which is exactly why
                        the two negative-CTP-pool lines are not among them: they describe a
                        night that is correct and saveable, and the notice above says so in
                        neutral words. Nothing else is filtered. */}
                    {visibleWarnings.length > 0 ? (
                        <ul className="rounded-[var(--radius-sm)] border border-[var(--color-warning)]/25 bg-[var(--color-warning-soft)] px-3 py-2.5 space-y-1 text-[11.5px] leading-snug text-[var(--color-ink)]">
                            {visibleWarnings.map((warning, index) => (
                                <li key={`${warning}-${index}`} className="flex gap-1.5">
                                    <span aria-hidden="true" className="text-[var(--color-warning)]">⚠</span>
                                    <span>{warning}</span>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </ReviewDisclosure>
        </div>
    );
}


// A locked Settle up once ended in a full-width "Review payouts →" row, itself the
// successor to a "Calculate Payouts →" primary. Both are gone. Nothing here calculates -
// payouts follow the data now - and the Day Rail directly above already reaches Review
// from any step, so the row spent a whole row of a phone screen on a second way to do
// what the rail does. The running "Paid out" figure it also carried went with it: the
// per-pool breakdown was always on Review, which is one tap away.

// Review when the inputs cannot produce a complete calculation. Showing the reasons is
// the whole job: the alternative - a confident total built from half the money - is the
// one failure this screen exists to prevent. Each reason is the validator's own wording,
// and the two jumps go to where the missing thing is actually entered.
function ReviewNotReady({ blockers = [], hasFloorStaff = false, onFixMoney, onFixFloor }) {
    return (
        <div className="space-y-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-4">
                <div className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="text-[var(--color-warning)]">⚠</span>
                    <div className="space-y-1.5">
                        <strong className="block text-sm text-[var(--color-ink)]">
                            No payouts to review yet
                        </strong>
                        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
                            Payouts follow the floor plan and the money you enter. These are still
                            missing, so there is no total to check:
                        </p>
                        <ul className="list-disc pl-4 text-[12.5px] leading-relaxed text-[var(--color-ink)] space-y-0.5">
                            {blockers.map((blocker, index) => (
                                <li key={`${blocker}-${index}`}>{blocker}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            {/* The jumps follow the same order the day does, and the money jump is
                withheld until somebody is on the floor - the rail disables Settle until
                then, so offering it here would contradict the pill two inches above. */}
            <FixJump
                label={hasFloorStaff ? "Fix on the Floor plan" : "Build the floor plan"}
                onClick={onFixFloor}
            />
            {hasFloorStaff ? <FixJump label="Enter money in Settle up" onClick={onFixMoney} /> : null}
        </div>
    );
}

// Review when the numbers are complete but the shift cannot be saved: it does not
// balance, and the write path throws on exactly that. This is the sibling of
// `ReviewNotReady` for the one blocker that survives a complete calculation, and it
// is paired with a disabled Confirm & Save - the button used to stay enabled on a
// shift that could never save, so the only feedback was "Failed to save." on the
// press, forever.
//
// It names the money rather than the invariant. `describeShiftBalance` reads the
// engine's own per-pool residuals, so "Bar CTP $500.00 left over" is the shift's own
// arithmetic, not a guess at it. The full balance check still lives in Shift totals
// below, which opens by default in this state - the reason and the warning belong
// together, so neither replaces the other.
function SaveBlocked({ balance, onFixMoney, onFixFloor }) {
    return (
        <div role="alert" className="space-y-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-4">
                <div className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="text-[var(--color-warning)]">⚠</span>
                    <div className="space-y-1.5">
                        <strong className="block text-sm text-[var(--color-ink)]">
                            {balance.headline}
                        </strong>
                        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
                            {balance.body}
                        </p>
                        {balance.leftovers.length > 0 ? (
                            <ul className="space-y-1.5 pt-0.5">
                                {balance.leftovers.map(leftover => (
                                    <li key={leftover.key} className="text-[12.5px] leading-snug text-[var(--color-ink)]">
                                        <span className="font-semibold">{leftover.label}</span>
                                        {" "}
                                        <span className="font-mono tabular-nums">{fmtMoney(leftover.amount)}</span>
                                        {" left over."}
                                        {leftover.hint ? (
                                            <span className="block text-[var(--color-ink-soft)]">{leftover.hint}</span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                </div>
            </div>
            <FixJump label="Fix in Settle up" onClick={onFixMoney} />
            <FixJump label="Fix on the Floor plan" onClick={onFixFloor} />
        </div>
    );
}

// A save that was attempted and refused. Distinct from `SaveBlocked`, which is known
// before the press; this is what came back from the write. `describeSaveFailure`
// turns the machine error into an instruction, and the fallback branch still carries
// the raw text so an unanticipated error is not swallowed into four words.
function SaveFailed({ failure }) {
    return (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] px-4 py-4">
            <div className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-[var(--color-danger)]">✕</span>
                <div className="space-y-1.5">
                    <strong className="block text-sm text-[var(--color-ink)]">{failure.headline}</strong>
                    <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">{failure.body}</p>
                    {failure.names?.length > 0 ? (
                        <ul className="list-disc pl-4 text-[12.5px] leading-relaxed text-[var(--color-ink)] space-y-0.5">
                            {failure.names.map(name => <li key={name}>{name}</li>)}
                        </ul>
                    ) : null}
                    {failure.detail ? (
                        <p className="font-mono text-[11px] leading-snug text-[var(--color-ink-soft)] break-words">
                            {failure.detail}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

// The floating action pair pinned to the bottom-right corner, shared by the Floor
// plan and Settle up editors so both screens enter/exit edit identically. Cancel is
// a neutral pill that never competes with the accent primary; each is its own 44px+
// tap target. (Single source of truth - do not fork a parallel FAB per screen.)
function EditorActionPair({ onCancel, onPrimary, primaryLabel, busy }) {
    return (
        <FloatingActions>
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
                {busy ? <Spinner /> : null}
                {primaryLabel}
            </button>
        </FloatingActions>
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

// The one discard prompt for leaving the editor with unsaved work. It is shared by
// the in-screen Cancel and by navigation that leaves from outside the editor (the
// home control, the workspace menu), so every exit warns identically.
const DISCARD_EDIT_CONFIRMATION =
    "Discard your changes to this closed shift?\n\n" +
    "Edits to a paid-out shift are only saved when you go to Review and " +
    "Confirm & Save Shift. Leaving now returns to the saved shift and keeps its " +
    "current payouts unchanged.";

function ShiftEditorPanel({ date, allEmployees, onClose, initialStep = "floor", onRegisterLeaveGuard }) {
    const { user } = useAuth();
    const { beginPendingAction } = usePendingActions();
    const [teams, setTeams] = useState([
        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
    const [runners, setRunners] = useState([]);
    const [saveStatus, setSaveStatus] = useState("");
    const [validationMessages, setValidationMessages] = useState([]);
    // What came back from a refused Confirm & Save, in captain-facing wording. Its own
    // state rather than `validationMessages`, which Review deliberately suppresses -
    // that suppression is why the failure reason used to reach nobody.
    const [saveFailure, setSaveFailure] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasLoadedShift, setHasLoadedShift] = useState(false);
    const [shiftStatus, setShiftStatus] = useState(null);
    // Day-step spine (shared by both flow shells): "floor" -> "settle" -> "review".
    // The old two-accordion editor is retired; each step is its own focused screen.
    const [step, setStep] = useState(["settle", "review"].includes(initialStep) ? initialStep : "floor");
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
                // No "· dining" tag: a numbered Team IS the dining room, so the word only
                // restated the pill you just tapped. The bar group keeps its tag - there
                // the pool really is a different one, and that distinction earns a word.
                sub: `${team.members.length} ${team.members.length === 1 ? "member" : "members"}`,
                poolLabel: "Pool",
                pool,
                hasPeople,
                status: getGroupMoneyStatus({ pool, hasOtherInput, hasPeople }),
                teamIndex: index,
            };
        });
        const barPool = poolSummary.bar.payoutPool;
        const barHasPeople = barTeam.members.length > 0;
        const barHasOtherInput = toMoney(barTeam.pools?.sales) > 0
            || toMoney(barTeam.pools?.covers) > 0
            || toMoney(barTeam.pools?.foodSales) > 0;
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
    // The count that sits beside the Pool figure counts only the groups that figure is
    // made of. `payoutPool` is dining CTP + GRT + bar CTP + bar GRT; runner pay is not in
    // it and never was - it is a deduction off the top, which is why the Runners pill is
    // labelled "Pay" and not "Pool". Counting Runners there put a group in the headline
    // that contributes nothing to the money printed next to it, so "5 groups · Pool $X"
    // described five groups with four groups' money. This changes the COUNT only; the
    // figure itself is untouched.
    const poolGroupSummary = summarizeGroupStatuses(
        closeoutGroups.filter(group => group.kind !== "runners"),
    );

    // Review's rung 2: every group's money exactly as it was typed at Settle up, all on
    // one screen. Settle up itself shows one group at a time, so this is the only place
    // the whole entry can be scanned for a typo in a single read.
    //
    // Runners are deliberately NOT here. Money you entered means money that FUNDS the
    // pool; runner pay is drawn OUT of that pool (engine.js subtracts `totalRunnerPay`
    // from the raw team CTP pool before the point split). Listing it alongside CTP and
    // GRT read as if runner pay added to the pool, overstating what there is to split.
    // Runner pay now appears in Shift totals as the deduction it is, and the runners
    // themselves stay in "Who's on the floor".
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
                    // Food sales funds nothing - it is what the fee below is derived
                    // from - but it belongs in a row whose whole job is "every number
                    // you typed, on one screen": a fee that looks wrong is checked
                    // against the figure it came from, and hiding that figure would
                    // send the check to the wrong place.
                    moneyEntry("Food sales", barTeam.pools?.foodSales),
                    // The bar's "Runners Fee" field (`pools.runners`). Despite the name
                    // this is NOT runner pay - that is the flat per-runner amount, which
                    // leaves the pool entirely and lives in Shift totals. This is a MOVE
                    // between the two sides: engine.js adds it to the dining CTP pool and
                    // takes the same amount off the bar CTP pool, so it changes who splits
                    // the money without changing how much there is. Keep this label in
                    // step with the PoolField on the Bar entry screen - the captain scans
                    // this row against the field they typed, so the two must read alike.
                    moneyEntry("Runners fee", barTeam.pools?.runners),
                ],
            },
        ];
    }, [teams, barTeam, poolSummary]);

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
                // Runners split no points - they are paid a flat amount off the pool - so
                // their meta carries that pay instead. It is the only place on Review the
                // per-group runner figure appears now that it is out of "Money you entered",
                // and here it reads as what it is: money leaving the pool, not funding it.
                pay: poolSummary.totalRunnerPay,
            },
        ];
    }, [teams, barTeam, runners, poolSummary.barPoints, poolSummary.totalRunnerPay]);

    // THE payout calculation, derived from the CURRENT floor plan and money on every
    // render rather than captured by a button press. That is the whole point: the old
    // model stored a snapshot in state and nulled it on any edit, so adding one person
    // on the Floor plan made Review unreachable until you walked back to Settle up and
    // pressed Calculate Payouts again. Recalculation now follows the data.
    //
    // `calculateShift` is pure - it reads the inputs and returns a result, writing
    // nothing - so deriving it costs nothing but the arithmetic and cannot persist a
    // half-finished shift. Confirm & Save is still the only thing that writes.
    //
    // The guard that matters: when the inputs cannot produce a complete calculation
    // this returns `ready: false` with the reasons, and Review renders those reasons
    // instead of a confident wrong total. Review NEVER shows a partially-derived
    // number as if it were final.
    const liveReview = useMemo(() => {
        if (!hasLoadedShift) return { ready: false, blockers: [], warnings: [] };

        const blockers = validateShiftInputs({ teams, barTeam, runners });
        if (blockers.length > 0) return { ready: false, blockers, warnings: [] };

        const result = calculateShift({ teams, barTeam, runners });
        const mappedPayouts = mapPayoutsForFirebase(result);
        if (Object.keys(mappedPayouts).length === 0) {
            return {
                ready: false,
                blockers: ["Assign at least one employee before payouts can be calculated."],
                warnings: [],
            };
        }

        return {
            ready: true,
            blockers: [],
            // Engine warnings (a shift that does not balance, a negative runner payout).
            // Not blockers - the numbers are complete - but the captain must see them
            // before committing, so Review surfaces them in Shift totals.
            warnings: result.validations || [],
            ...buildPayoutReview(result, mappedPayouts),
        };
    }, [hasLoadedShift, teams, barTeam, runners]);

    // The one rule that blocks a save on a complete calculation. Derived on every
    // render alongside `liveReview` so Review can withhold the save BEFORE the press
    // instead of reporting it afterwards - `saveClosedShiftAtomically` re-runs the
    // same check and throws, so anything this reports blocked would have failed.
    const balanceReport = useMemo(() => (
        liveReview.ready ? describeShiftBalance({ result: liveReview.result, teams, barTeam }) : null
    ), [barTeam, liveReview, teams]);
    const saveBlocked = Boolean(balanceReport && !balanceReport.balanced);

    // A failure describes the shift as it was when it was refused. Any edit to the
    // roster or the money makes that description stale, so it goes.
    useEffect(() => {
        setSaveFailure(null);
    }, [teams, barTeam, runners]);

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

    // Food sales has one behaviour no other pool field has: it PREFILLS the Runners
    // Fee at 3%, and only while the fee is still tracking that derivation. The rule
    // lives in `applyBarFoodSalesEdit` so it can be tested without a browser; what
    // matters here is that entering food sales on a shift settled under the old model
    // leaves that night's typed fee alone rather than silently moving its money.
    const updateBarFoodSales = useCallback((value) => {
        setBarTeam(prev => ({ ...prev, pools: applyBarFoodSalesEdit(prev.pools || {}, value) }));
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
                    const d = applyOpenShiftMemberNames(shiftDoc.data());
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
            setSaveStatus("This shift is already closed and paid out. Go to Review and Confirm & Save Shift to update the roster and payouts together.");
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
        const endPendingAction = beginPendingAction();

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
            endPendingAction();
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
    // (Done -> Review -> Confirm & Save), so this only runs for a setup shift; the
    // closed case is wired to goToReview on the button.
    const handleDoneSettle = async () => {
        if (isSaving) return;
        setIsSaving(true);
        setSaveStatus("Saving money…");
        const endPendingAction = beginPendingAction();
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
            endPendingAction();
        }
    };

    // Has the admin actually changed anything since the shift loaded?
    const isDirty = hasLoadedShift
        && loadedFingerprintRef.current !== ""
        && fingerprintShift(teams, barTeam, runners) !== loadedFingerprintRef.current;

    // Leaving the editor loses work only on a closed shift: a setup shift autosaves
    // its draft continuously, while a closed shift disables autosave (edits persist
    // only through Review -> Confirm & Save), so an in-progress edit would be dropped.
    // Read through a ref so the guard handed to the parent below can stay stable while
    // the fingerprint keeps changing on every keystroke.
    const leaveGuardStateRef = useRef({ isSaving: false, wouldDropWork: false });
    leaveGuardStateRef.current = {
        isSaving,
        wouldDropWork: shiftStatus === "closed" && isDirty,
    };

    // The single gate every exit from the editor passes through. Returns true when it
    // is safe to leave: no unsaved work, or the admin confirmed the discard. Nothing
    // in-editor is written either way - the caller re-reads the day.
    const confirmLeaveEditor = useCallback(() => {
        const { isSaving: saving, wouldDropWork } = leaveGuardStateRef.current;
        if (saving) return false;
        if (!wouldDropWork) return true;
        return window.confirm(DISCARD_EDIT_CONFIRMATION);
    }, []);

    // Hand the guard up so navigation that lives OUTSIDE this panel (the app bar's
    // home control, the workspace menu) warns exactly as Cancel does instead of
    // silently discarding the edit. Withdrawn on unmount so a stale guard can never
    // block navigation once the editor is gone.
    useEffect(() => {
        if (!onRegisterLeaveGuard) return undefined;
        onRegisterLeaveGuard(confirmLeaveEditor);
        return () => onRegisterLeaveGuard(null);
    }, [onRegisterLeaveGuard, confirmLeaveEditor]);

    // Cancel: leave edit mode WITHOUT committing and return to the read-only landing.
    // onClose() re-reads the day, so nothing in-editor is written.
    const handleCancelEdit = () => {
        if (!confirmLeaveEditor()) return;
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
                "Edits to a paid-out shift are only saved when you go to Review and " +
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

    // Day rail step navigation (Floor -> Settle -> Review). Every step is one tap away
    // in the editor, including Review: it derives from the live inputs, so there is
    // nothing to unlock. (The old "Pay out" pill that exited to the landing was removed
    // - the side nav / save flows already return there.)
    const goToStep = (key) => {
        // Leaving Settle by the rail abandons an in-progress money edit's UNLOCKED state
        // but keeps the typed values, which is what the rail's other jumps already do.
        setStep(key);
    };

    // Review as a destination: used by the closed-shift Done buttons, which route the
    // paid-out edit through Review -> Confirm & Save rather than saving in place.
    const goToReview = () => {
        if (isSaving) return;
        setValidationMessages([]);
        setSaveStatus("");
        setSaveFailure(null);
        setSettleEditable(false);
        setStep("review");
    };

    const handleConfirmSave = async () => {
        // `saveBlocked` mirrors the reconciliation the write path re-runs and throws on,
        // so this is the same refusal made before anything is attempted rather than
        // after. The button is disabled in that state; this is the belt to its braces.
        if (isSaving || !liveReview.ready || saveBlocked) return;

        const mappedPayoutsForFirebase = liveReview.mappedPayouts;
        const result = liveReview.result;

        setIsSaving(true);
        setSaveStatus("Saving…");
        setSaveFailure(null);
        // Spans the write and the day refetch that onClose kicks off, so the
        // workspace progress bar reads as one wait rather than two.
        const endPendingAction = beginPendingAction();
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
            setShiftStatus("closed");
            // Reset before leaving: the leave guard refuses to let go while this is
            // set, and it used to stay true for the whole hand-over.
            setIsSaving(false);
            // Hand straight over to the saved day. This used to sit on a 1500ms
            // timer, which parked the admin on Review after the work was done and
            // put the "Saved." line on the screen they were about to leave; the
            // day landing is where the confirmation belongs.
            onClose({ saved: true });
        } catch (e) {
            console.error(e);
            // Deliberately no status line: it used to read "Failed to save." and that
            // was the ENTIRE on-screen explanation. The alert below now carries the
            // reason, and a four-word line above it would only say it worse twice.
            setSaveStatus("");
            // Who on this shift has no first name on their profile. firestore.rules
            // `validUserProfile()` requires one, and the closeout batch updates every
            // participant's user document, so a single nameless profile refuses the
            // whole batch - previously with nothing on screen naming the person or the
            // reason. Computed from data the editor already holds, only when a save has
            // actually failed.
            setSaveFailure(describeSaveFailure(e, {
                namelessParticipants: findNamelessParticipants({
                    participantUids: getShiftParticipantUids({
                        teams,
                        barTeam,
                        runners,
                        payouts: mappedPayoutsForFirebase,
                    }).filter(uid => realEmployeeUids.has(uid)),
                    employees: allEmployees || [],
                }),
            }));
            setIsSaving(false);
        } finally {
            endPendingAction();
        }
    };

    // Review no longer bounces back to Settle up when the numbers are not ready. Being
    // silently redirected was the confusing half of the old model - the captain tapped
    // Review and landed somewhere else with no explanation. Review is now always its
    // own screen; when the inputs are incomplete it says what is missing (see
    // `ReviewNotReady`) instead of pretending to be Settle up.
    const effectiveStep = step;

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
        reviewReady: liveReview.ready,
        hasFloorStaff: hasAssignedStaff,
    });

    // On a phone every step is BOUND to the viewport, not merely floored at it, and that
    // one distinction is the whole overflow defect. A `min-height` leaves the column's
    // used height auto, so it sizes to its CONTENT; the `flex-1 min-h-0` chain below it
    // then never gets a definite height to shrink against, and the inner `overflow-y-auto`
    // boxes never become scrollers. The PAGE scrolls instead, and the panel slides up
    // under the sticky Day Rail while the step's own chrome - the editing strip, the pool
    // summary, the group switcher - leaves the screen entirely. A definite height is what
    // hands the chain something to divide, so the inner box scrolls and the page does not.
    //
    // This was gated behind `(min-height: 700px)` and applied to the money steps alone,
    // which is why it read as a fix that had not taken: a phone browser's usable viewport
    // is routinely shorter than that (320x568, 375x667, 390x664 all miss it), so on the
    // screens that had the defect the rule never matched, and the floor plan was never
    // given a height at all. The gate is gone and all three steps are bound.
    //
    // Content still packs snug at the top: the panel grows, the rows do not spread out.
    // What scrolls differs by step - the floor plan scrolls its team grid, Settle up
    // scrolls the entry panel's BODY so the group's name and pool stay pinned, Review
    // scrolls its whole column.
    //
    // The `min-h` beside the height is a floor, not a fallback to the old behaviour: it
    // keeps the height DEFINITE (a min-height only clamps the used height, it does not
    // return it to auto) so the chain still works, while stopping a rotated or unusually
    // short viewport from squeezing the money into a slot no field fits in. At 320x568 -
    // the tight phone - the calc wins at 472px and the floor never bites.
    const isFullHeightStep = effectiveStep === "floor"
        || effectiveStep === "settle"
        || effectiveStep === "review";

    return (
        <div className={"space-y-3 sm:space-y-4"
            + (isFullHeightStep ? " max-[560px]:flex max-[560px]:flex-col max-[560px]:h-[calc(100dvh-6rem)] max-[560px]:min-h-[420px] max-[560px]:space-y-0" : "")}>
            {/* The day rail: an ordered, day-level step spine. Status is always
                shown; earlier/reachable steps are one tap away (order never forced).
                On a phone's full-height steps it stops being its own floating card and
                becomes the top of ONE continuous surface with the editor Card below:
                square bottom corners, no gap, and the same tint as the context band
                inside, so the boxes divide context from entry rather than from itself. */}
            <DayRail steps={railSteps} onStepClick={goToStep}
                className={isFullHeightStep ? "max-[560px]:rounded-b-none max-[560px]:bg-[var(--color-band)]" : ""} />

            {/* Edit mode reads as a distinct layer: an accent stroke + soft accent
                elevation lifts the workspace off the page, versus the plain bordered
                cards of the read-only landing. A settled shift's money steps (settle /
                review) keep a neutral frame so the accent never competes with their
                warning styling, but its FLOOR step gets the same accent editing frame
                as a setup shift (v3: identical in-place edit look). */}
            <Card className={"!p-0 " + (isFullHeightStep ? "max-[560px]:rounded-t-none max-[560px]:border-t-0 " : "") + (showEditFrame
                ? "ring-2 ring-[var(--color-accent)]/25 shadow-[0_10px_30px_rgba(47,111,79,0.10)]"
                : "")
                + (isFullHeightStep ? " max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0" : "")}>
                <header className="hidden sm:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-line)]">
                    <div className="flex flex-col gap-1">
                        {/* No date here: the app bar now carries the day being edited
                            at every width, pinned, and in a readable form. This header
                            printed the raw ISO key, so the same day appeared twice on
                            one screen in two different formats. */}
                        <h2 className="font-display text-base sm:text-lg font-medium tracking-tight text-[var(--color-ink)]">
                            Shift Workspace
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
                {/* Both strips PIN under the Day Rail rather than scrolling beneath it.
                    On a short viewport the editor column hits its 420px floor, the page
                    starts to scroll, and the rail - being sticky - slid straight over
                    whichever strip sat below it. The cue that says you are editing, or
                    that this shift is already paid out, is exactly the thing that must
                    not disappear the moment you move the screen. */}
                {(shiftStatus === "closed" && effectiveStep !== "floor") ? (
                    <div className="sm:hidden sticky top-[var(--rail-stack-top)] z-[9] flex items-center gap-2 px-3 py-1 border-b border-[var(--color-warning)]/25 bg-[var(--color-warning-soft)]">
                        {/* The raw ISO date used to sit at the right of this strip,
                            because the day was otherwise invisible on a phone. The app
                            bar now carries it, pinned and readable, so this strip is
                            back to saying only what it is for: this shift is paid out.

                            Sized down to a marker rather than a banner: it has to be
                            unmissable before a re-save, not loud, and every pixel it
                            spends comes straight off the money below it. It keeps the
                            warning colour and the dot, which is what makes it read at
                            this size - do not also shrink those. */}
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-warning)]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                            Closed shift · Paid out
                        </span>
                    </div>
                ) : isEditingLayer ? (
                    <div className="sm:hidden sticky top-[var(--rail-stack-top)] z-[9] flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)]">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-accent)]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                            {effectiveStep === "settle"
                                ? "Editing · Settle up"
                                : effectiveStep === "review"
                                    ? "Editing · Review"
                                    : "Editing floor plan"}
                        </span>
                    </div>
                ) : null
                /* A locked Settle up used to print a neutral "SETTLE UP" strip here. The
                   Day Rail directly above already marks Settle as the active step, so the
                   strip said the step's name a second time and charged the money below it
                   a full band of height to do so. The two strips that remain each say
                   something the rail does not: this shift is already paid out, and you are
                   in the editing layer. */}

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
                                    save (Review, with the "Re-saving overwrites the saved payouts
                                    for {date}" warning + Confirm & Save).
                                    Nothing is written until that explicit confirm. */}
                                <EditorActionPair
                                    onCancel={handleCancelEdit}
                                    onPrimary={shiftStatus === "closed" ? goToReview : handleDoneFloor}
                                    primaryLabel={isSaving ? "Saving…" : "✓ Done"}
                                    busy={isSaving}
                                />
                            </div>
                        ) : effectiveStep === "settle" ? (
                            /* STEP 2 - Settle up: the calm single money switcher, edited in place and
                               saved with the same bottom-right FAB as the floor plan. The bottom
                               padding is that FAB's clearance, so the last money row (the Contracts
                               disclosure) can always be scrolled clear of it - and it is not
                               phone-only, because the FAB is `fixed` at every width.

                               On a phone the section is a column that fills the screen: the summary
                               line, the group switcher and the Review payouts row are flex-none, and
                               the entry panel between them takes every remaining pixel and scrolls
                               its own body.

                               The FAB's clearance is INSIDE that scroller (the body's own pb-14),
                               not below the panel. Reserving it outside cost a band of dead screen
                               on the one surface with no height to spare, and bought nothing the
                               scroller cannot buy itself: the last field still scrolls clear of the
                               floating pill, it just does so within the panel. So the panel now runs
                               to the bottom of the card. The desktop pb-24 stays - there the page
                               scrolls and the FAB is fixed at every width. */
                            <section className="space-y-4 pb-24 max-[560px]:pb-0 max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0">
                                {/* Team switcher: a compact horizontal strip above one fixed-height entry
                                    panel. Tapping a pill focuses that group; the strip scrolls sideways on
                                    phone so page height stays constant no matter how large the roster is.
                                    A status line + edge fade keep off-screen groups and their money status
                                    discoverable instead of a blind sideways swipe.

                                    On a phone the day's pool and the switcher are CONTEXT, not
                                    entry, so they share one tinted band that runs edge to edge
                                    (the negative margins cancel the Card's padding) and ends in a
                                    single hairline. Below that hairline is plain paper carrying
                                    nothing but the money fields. One line divides the two, instead
                                    of three boxes dividing the context from itself. */}
                                <div className="[--rail-fade:var(--color-surface)] max-[560px]:[--rail-fade:var(--color-band)] space-y-4 max-[560px]:space-y-0 max-[560px]:flex max-[560px]:flex-col max-[560px]:gap-2.5 max-[560px]:flex-none max-[560px]:-mx-3 max-[560px]:-mt-3 max-[560px]:px-3 max-[560px]:pt-3 max-[560px]:pb-2 max-[560px]:bg-[var(--color-band)] max-[560px]:border-b max-[560px]:border-[var(--color-line)]">
                                {/* On a phone the tabs come FIRST and this summary reads
                                    underneath them: you pick the team, then the day's total
                                    and what is still owed sit closest to the money they
                                    describe. `order` moves it visually without moving it in
                                    the DOM, so the tab strip keeps its natural focus order.
                                    Desktop keeps the original stacking (block flow, no
                                    flex, so `order` does nothing there). */}
                                <div className="flex items-center justify-between gap-3 max-[560px]:order-2">
                                    <span className="inline-flex items-baseline gap-2">
                                        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                                            {poolGroupSummary.total} {poolGroupSummary.total === 1 ? "group" : "groups"} · Pool
                                        </span>
                                        <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                                            {fmtMoney(poolSummary.payoutPool)}
                                        </strong>
                                    </span>
                                    {/* Phone: the per-tab dots already carry this. Each tab shows its
                                        own group's state in its own colour, right next to the name you
                                        would tap to fix it, so a rolled-up count of the same fact was
                                        the screen saying it twice - once vaguely. Desktop keeps the
                                        roll-up: there the switcher can hold more groups than the eye
                                        counts dots for. */}
                                    {groupStatusSummary.total > 0 ? (
                                        groupStatusSummary.needsMoney > 0 ? (
                                            <span className="max-[560px]:hidden inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-warning)]">
                                                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                                                {groupStatusSummary.needsMoney} still need money
                                            </span>
                                        ) : (
                                            <span className="max-[560px]:hidden inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
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
                                    fadeFrom="var(--rail-fade)"
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
                                </div>

                                {/* Locked view = these very same fields, disabled. A native
                                    disabled fieldset switches every input/stepper off at once; Edit
                                    flips it back on in place. The group switcher above stays outside
                                    the fieldset so you can still page through each group while locked. */}
                                <fieldset disabled={!settleEditable} className="m-0 min-w-0 border-0 p-0 max-[560px]:!mt-3 max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0">
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
                                            <BarPoolFields
                                                barTeam={barTeam}
                                                onBarPoolChange={updateBarPool}
                                                onBarFoodSalesChange={updateBarFoodSales}
                                            />
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
                                    <p aria-live="polite" aria-atomic="true" className="sm:hidden text-xs text-[var(--color-ink-soft)]">
                                        {saveStatus || draftStatus}
                                    </p>
                                ) : null}

                                {settleEditable ? (
                                    /* Editing: the floor plan's floating pair. Cancel re-locks without
                                       saving; Done saves the money and re-locks in place (a closed shift
                                       instead takes the paid-out path: Done -> Review -> Confirm & Save). */
                                    <EditorActionPair
                                        onCancel={handleCancelSettle}
                                        onPrimary={shiftStatus === "closed" ? goToReview : handleDoneSettle}
                                        primaryLabel={isSaving ? "Saving…" : "✓ Done"}
                                        busy={isSaving}
                                    />
                                ) : (
                                    /* Nothing sits under the entry panel on a locked Settle up. The
                                       full-width row that used to (see the note above
                                       `ReviewNotReady`) only led to Review, which the rail above
                                       already does, so the panel gets that height and the floating
                                       ✎ Edit is the one action on the screen. */
                                    <FloatingActions>
                                            <button
                                                type="button"
                                                onClick={handleEditSettle}
                                                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95"
                                            >
                                                ✎ Edit
                                            </button>
                                        </FloatingActions>
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
                               Settle up does it.

                               On a phone this column IS the scroller: it takes the height
                               left under the day rail and the editing strip and scrolls
                               inside itself, so the rail stays reachable while the numbers
                               are read. The bottom padding rides inside that scroll, which
                               is what still lets the last row clear the floating save. */
                            <section className="space-y-4 pb-24 sm:mx-auto sm:max-w-lg max-[560px]:flex-1 max-[560px]:min-h-0 max-[560px]:overflow-y-auto max-[560px]:overscroll-contain">
                                {/* Why this shift cannot be saved, above the numbers it is about.
                                    Both blocks sit at the top of Review deliberately: a reason
                                    below the fold is the same dead end as no reason at all. */}
                                {saveFailure ? <SaveFailed failure={saveFailure} /> : null}

                                {liveReview.ready && saveBlocked ? (
                                    <SaveBlocked
                                        balance={balanceReport}
                                        onFixMoney={() => setStep("settle")}
                                        onFixFloor={() => setStep("floor")}
                                    />
                                ) : null}

                                {liveReview.ready ? (
                                    <CalculatedPayoutReview
                                        review={liveReview}
                                        poolAvailable={poolSummary.payoutPool}
                                        barPoolEntered={poolSummary.bar.payoutPool}
                                        runnersFeeTransfer={poolSummary.runnerTransfer}
                                        availableCash={poolSummary.totalCash}
                                        balanceBlocked={saveBlocked}
                                        warnings={liveReview.warnings}
                                        moneyGroups={reviewMoneyGroups}
                                        floorGroups={reviewFloorGroups}
                                        floorPoints={poolSummary.restaurantPoints + poolSummary.barPoints}
                                        onFixMoney={() => setStep("settle")}
                                        onFixFloor={() => setStep("floor")}
                                    />
                                ) : (
                                    <ReviewNotReady
                                        blockers={liveReview.blockers}
                                        hasFloorStaff={hasAssignedStaff}
                                        onFixMoney={() => setStep("settle")}
                                        onFixFloor={() => setStep("floor")}
                                    />
                                )}

                                {liveReview.ready && shiftStatus === "closed" ? (
                                    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--color-warning)]">
                                        <span aria-hidden="true">⚠</span>
                                        <span>Re-saving overwrites the saved payouts for {date}.</span>
                                    </p>
                                ) : null}

                                {/* Phone only. The step's warnings block is suppressed above, so
                                    this is the only channel left for save progress and failure on a
                                    narrow screen - but the desktop workspace header already carries
                                    the very same string, and rendering both printed "Draft saved."
                                    twice on one screen. */}
                                {(saveStatus || draftStatus) ? (
                                    <p aria-live="polite" aria-atomic="true" className="sm:hidden text-xs text-[var(--color-ink-soft)]">
                                        {saveStatus || draftStatus}
                                    </p>
                                ) : null}

                                {/* Same floating primary as the Floor plan and Settle up: one
                                    accent pill, bottom-right, always in reach without scrolling.
                                    It is only rendered when there is a complete calculation to
                                    commit - an incomplete Review offers the fix jumps instead,
                                    so there is never a save button over numbers that do not
                                    exist yet.

                                    Disabled, not withheld, when the shift does not balance. The
                                    button used to stay enabled on a shift the write path could
                                    never accept, so it invited pressing forever; removing it
                                    outright would leave the captain wondering where the save
                                    went. A greyed button beside the SaveBlocked notice above
                                    says both things at once - it is there, and this is why it
                                    will not go. A disabled button is never unexplained: the
                                    notice renders under exactly the same condition. */}
                                {liveReview.ready ? (
                                    <FloatingActions>
                                        <button
                                            type="button"
                                            onClick={handleConfirmSave}
                                            disabled={isSaving || saveBlocked}
                                            title={saveBlocked ? balanceReport.headline : undefined}
                                            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95 disabled:opacity-60 disabled:active:scale-100"
                                        >
                                            {isSaving ? (
                                                <>
                                                    <Spinner />
                                                    <span>Saving shift…</span>
                                                </>
                                            ) : (
                                                "✓ Confirm & Save Shift"
                                            )}
                                        </button>
                                    </FloatingActions>
                                ) : null}
                            </section>
                        )}
                    </div>
                )}
            </Card>

        </div>
    );
}

export default ShiftEditorPanel;
