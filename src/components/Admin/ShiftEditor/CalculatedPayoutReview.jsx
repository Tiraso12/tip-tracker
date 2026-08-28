import { useState } from "react";
import NegativeNightNotice from "../NegativeNightNotice";
import { formatContractRate } from "../../../utils/engine";
import { getExternalFeeTotal } from "../../../utils/payoutLedger";
import {
    fmtMoney,
    getPayoutNonCashTotal,
    selectSpotCheckSubject,
    withoutNegativePoolWarnings,
} from "../shiftEditorUtils";
import { FixJump } from "./FixJump";
import { LedgerRow } from "./LedgerRow";
import { SpotCheckCard } from "./SpotCheckCard";

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

export function CalculatedPayoutReview({
    review,
    poolAvailable,
    diningNetRevenue = 0,
    barNetRevenue = 0,
    barPoolEntered = 0,
    runnersFeeTransfer = 0,
    availableCash = 0,
    balanceBlocked = false,
    warnings = [],
    moneyGroups = [],
    floorGroups = [],
    floorPoints = 0,
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

    // Not entered directly - the captain only types a contract's gratuity, so the
    // engine derives the sales that gratuity implies at the contract rate in force
    // on the SHIFT's own date (engine.js `contractSales = grtContractTotal /
    // getContractRate(date)`). It is already included inside `diningNetRevenue`
    // (every team's whole `pools.sales`), not additional money - shown only as a
    // breakout of what's already counted above, and only when a contract actually
    // put money into it. The sub-label reads the rate off that same date so an old
    // night reopened for an edit is never labelled at today's rate.
    const contractSales = Number(result.derivedValues?.contractSales) || 0;
    const contractRateLabel = formatContractRate(result.normalizedInputs?.date);

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
                {/* NOTE for future edits: dining money is pooled house-wide across every
                    dining team and split by one point value (engine.js), so a wrong figure
                    moves everyone. Do not add copy here that attributes a person's payout
                    to one team's money - it cannot, and it would send the hunt the wrong way. */}
                <div className="divide-y divide-[var(--color-line)]">
                    {moneyGroups.map(group => (
                        <div key={group.id} className="py-2.5 first:pt-0 last:pb-0">
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
                </div>
            </ReviewDisclosure>

            {/* The floor roster, for spotting someone who should not be on. */}
            <ReviewDisclosure
                title="Who's on the floor"
                meta={`${floorHeadcount} ${floorHeadcount === 1 ? "person" : "people"} · ${floorPoints} ${floorPoints === 1 ? "pt" : "pts"}`}
                open={openRow === "floor"}
                onToggle={() => toggle("floor")}
            >
                <div className="space-y-3">
                    <div className="divide-y divide-[var(--color-line)]">
                        {floorGroups.map(group => (
                            <div key={group.id} className="py-2.5 first:pt-0 last:pb-0">
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
                    </div>
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
                <div className="space-y-4">
                    {/* The captain's own two figures, ahead of everything the engine
                        derives: each dining team's Net revenue summed, and the bar
                        card's Net revenue - the same `pools.sales` shown on their
                        respective Settle up cards, not a payout or a pool split. */}
                    <div className="space-y-1.5">
                        <LedgerRow label="Dining room net revenue" value={fmtMoney(diningNetRevenue)} testId="totals-dining-net-revenue" />
                        {contractSales > 0 ? (
                            <LedgerRow
                                label="Contract sales"
                                sub={`derived from contract gratuity at ${contractRateLabel}, included above`}
                                value={fmtMoney(contractSales)}
                                testId="totals-contract-sales"
                            />
                        ) : null}
                        <LedgerRow label="Bar net revenue" value={fmtMoney(barNetRevenue)} testId="totals-bar-net-revenue" />
                    </div>

                    {/* The dining ledger, then the three destinations it resolves into.
                        There is deliberately NO parallel bar ledger: the captain's call,
                        and a correct one - the footer below already names dining take-home,
                        bar take-home and runners, so a second column deriving the bar would
                        state the same figure twice. What the bar needs from this ledger is
                        the transfer pair, and both legs are visible here as dining-side
                        movements ("− To the bar", "+ Runners fee").

                        Flat rows, no boxed-card background: three logical sections (dining
                        ledger, three-pool split, cash cross-check) stay readable through a
                        small uppercase label and a hairline before each running total,
                        matching the kit's plain list rather than stacking a card per section. */}
                    <div className="space-y-1.5">
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
                        <div className="border-t border-[var(--color-line)] pt-1.5">
                            <LedgerRow label="= Dining take-home" value={fmtMoney(diningTake)} tone="total" testId="totals-dining-ledger" />
                        </div>
                    </div>

                    {/* Intent option 1: an all-in total that is ALWAYS decomposed and is
                        never called the floor. The three rows are the engine's three real
                        destinations - dining pool, bar pool, runners - so the combined
                        figure can never read as one pooled split. Keeping it is what lets
                        the balance check below mean anything: the engine reconciles
                        `totalAvailable − totalDistributed` across all three, so dropping
                        the combined number would leave "✓ Balanced" anchored to nothing. */}
                    <div className="space-y-1.5 border-t border-[var(--color-line)] pt-4">
                        <LedgerRow label="Dining take-home" sub="split by dining points" value={fmtMoney(diningTake)} testId="totals-dining" />
                        <LedgerRow label="Bar take-home" sub="its own pool, split by bar points" value={fmtMoney(barTake)} testId="totals-bar" />
                        <LedgerRow label="Runners" sub="flat, off the dining pool" value={fmtMoney(runnerTake)} testId="totals-runners" />
                        <div className="border-t border-[var(--color-line)] pt-1.5">
                            <LedgerRow label="= Everyone paid" sub="all three pools, CTP + GRT" value={fmtMoney(staffTotal)} tone="total" testId="totals-everyone-paid" />
                        </div>
                    </div>

                    {/* Tier 3 - the cross-checks. Cash is money too, but it is distributed
                        separately and must never fold into the pool total (CTP + GRT); it
                        sits here because unlike every derived figure above it is a number
                        the captain typed, so it is the one worth checking against reality. */}
                    <div className="space-y-2 border-t border-[var(--color-line)] pt-4">
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
