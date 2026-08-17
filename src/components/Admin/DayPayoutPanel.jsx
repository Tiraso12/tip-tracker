import React, { useState } from "react";
import { Badge, Card, Table, THead, TBody, TR, TH, TD } from "../ui";
import { rolePluralLabel } from "../../utils/roleLabels";
import NegativeNightNotice from "./NegativeNightNotice";
import { withoutNegativePoolWarnings } from "./shiftEditorUtils";

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;
// singular/plural helper, matching the `member`/`members` pattern in ShiftSetupDnd.
const plural = (count, one, many) => (count === 1 ? one : many);
// Display-only relabel of the engine's internal breakdown keys into captain
// vocabulary (the engine key stays "Manual Split"; only the shown label changes).
const RUNNER_SOURCE_LABELS = { "Manual Split": "Runner pay" };
const runnerSourceLabel = (src) => RUNNER_SOURCE_LABELS[src] || src;
const getNonCashPayoutTotal = (payout = {}) => (Number(payout.ctp) || 0) + (Number(payout.grt) || 0);
const sumBy = (rows, key) => rows.reduce((sum, r) => sum + (Number(r[key]) || 0), 0);

// The kit's headline pool-summary cards, made honest for a night that actually
// has a bar team: dining and bar are SEPARATE pools (see the money rule in
// AGENTS.md) so they get separate cards rather than the kit's single undivided
// "Dining pool (CTP)" tile. Summed straight off the same role-grouped rows the
// payout table below renders - never off the engine's pool-adjustment figures -
// so the cards and the table can never disagree by a rounding penny.
function poolTotals(summary) {
    const roleGrouped = summary?.payouts?.roleGrouped || {};
    const diningRows = ["captains", "servers", "backs", "assistants"].flatMap((key) => roleGrouped[key] || []);
    const barRows = roleGrouped.bar || [];
    const runnerRows = roleGrouped.runners || [];
    const dining = { ctp: sumBy(diningRows, "ctp"), grt: sumBy(diningRows, "grt") };
    const bar = { ctp: sumBy(barRows, "ctp"), grt: sumBy(barRows, "grt") };
    const runnerPay = sumBy(runnerRows, "payoutAmount");
    const cash = sumBy(diningRows, "cash") + sumBy(barRows, "cash");
    // "Everyone paid": every pool's CTP + GRT, cash excluded (the money rule -
    // cash is reported on its own line, never folded into a total). Matches the
    // Review step's own "= Everyone paid" ledger row so the two screens agree.
    const everyonePaid = dining.ctp + dining.grt + bar.ctp + bar.grt + runnerPay;
    return { dining, bar, cash, runnerPay, everyonePaid };
}

function PoolCard({ label, value, detail }) {
    return (
        <Card className="!p-3.5 sm:!p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                {label}
            </p>
            <p className="mt-1.5 font-mono tabular-nums text-xl sm:text-[22px] text-[var(--color-ink)]">
                {fmt(value)}
            </p>
            {detail ? <p className="mt-0.5 truncate text-[11px] text-[var(--color-ink-soft)]">{detail}</p> : null}
        </Card>
    );
}

function PoolSummaryCards({ summary }) {
    const totals = poolTotals(summary);
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <PoolCard
                label="Dining pool"
                value={totals.dining.ctp + totals.dining.grt}
                detail={`CTP ${fmt(totals.dining.ctp)} · GRT ${fmt(totals.dining.grt)}`}
            />
            <PoolCard
                label="Bar pool"
                value={totals.bar.ctp + totals.bar.grt}
                detail={`CTP ${fmt(totals.bar.ctp)} · GRT ${fmt(totals.bar.grt)}`}
            />
            <PoolCard label="Cash" value={totals.cash} detail="Paid separately" />
            <PoolCard label="Runner pay" value={totals.runnerPay} detail="Off the top" />
        </div>
    );
}

function StatColumn({ label, children }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                {label}
            </span>
            <dl className="flex flex-col gap-1 text-sm text-[var(--color-ink)]">
                {children}
            </dl>
        </div>
    );
}

function StatLine({ label, value, strong = false }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
            <dd
                className={
                    "font-mono tabular-nums " +
                    (strong ? "font-semibold" : "")
                }
            >
                {value}
            </dd>
        </div>
    );
}

function BalanceValue({ value }) {
    return (
        <span
            className={
                "font-mono tabular-nums font-semibold " +
                (Number(value) === 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]")
            }
        >
            {fmt(value)}
        </span>
    );
}

// `key` is the engine's roleGrouped bucket (engine.js); `role` is the seniority
// order the rows render in - captain down to runner, same order the Team
// roster reads (`roleSeniorityRank`) - so a payout list and a floor-plan
// filter chip can never drift apart.
const ROLE_GROUPS = [
    { key: "captains", role: "captain" },
    { key: "servers", role: "server" },
    { key: "backs", role: "back" },
    { key: "assistants", role: "assistant" },
    { key: "bar", role: "bartender" },
    { key: "runners", role: "runner", isRunner: true },
];

// The full engine breakdown - inputs, house/bar allocations, balances - kept
// as a single collapsed-by-default disclosure at every width. The pool-summary
// cards above now cover the "glance" job the kit asks for, so this detail sits
// tucked below the payout table as supporting evidence, same as Review's own
// disclosure rows: "the card is the screen, these are where you look if it
// disagrees" (CalculatedPayoutReview.jsx).
function AuditSummary({ summary }) {
    const [isOpen, setIsOpen] = useState(false);
    const availableNonCash = (summary.balances?.totalAvailable || 0) - (summary.derivedValues?.baseTeamCash || 0);
    const distributedNonCash = (summary.balances?.totalDistributed || 0) - (summary.derivedValues?.baseTeamCash || 0);

    const details = (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5 bg-[var(--color-surface-muted)]/50 border border-[var(--color-line)] rounded-[var(--radius-md)]">
            <StatColumn label="Inputs">
                <StatLine label="Team Sales" value={fmt(summary.derivedValues?.totalTeamSales)} strong />
                <StatLine label="Contract Grat" value={fmt(summary.derivedValues?.grtContractTotal)} />
                <StatLine
                    label={`DCTP (${fmt(summary.derivedValues?.baseTeamCTP)}) + BCTP (${fmt(summary.derivedValues?.barCTP)})`}
                    value={fmt(summary.derivedValues?.ctpTotal)}
                />
                <StatLine label="Cash Total" value={fmt(summary.derivedValues?.baseTeamCash)} />
                <StatLine label="Grat Total" value={fmt(summary.derivedValues?.grtTotal)} />
            </StatColumn>

            <StatColumn label="Allocations (House & Bar)">
                <StatLine
                    label="Door"
                    value={fmt((summary.allocations?.doorCTPAllocation || 0) + (summary.allocations?.doorGRTAllocation || 0))}
                />
                <StatLine
                    label="Bar Cut"
                    value={fmt((summary.allocations?.barCTPAllocation || 0) + (summary.allocations?.barGRTAllocation || 0))}
                />
                <StatLine label="House" value={fmt(summary.allocations?.houseAllocation || 0)} />
                <StatLine label="Coordinator" value={fmt(summary.allocations?.peCoordinatorGRT || 0)} />
                {/* "Runner Pay", NOT "Runners Fee". `totalRunnerPay` is the flat amount
                    paid to each runner, taken off the top of the dining pool. The bar's
                    "Runners Fee" at Settle up is a different number entirely - a transfer
                    of CTP from the bar pool to the dining pool - and this row carried the
                    same words, so the audit trail showed one name against two figures
                    with no cue they differ. The Settle up label is unchanged; only this
                    one moves, because pay to runners is what this unambiguously is. */}
                <StatLine label="Runner Pay" value={fmt(summary.allocations?.totalRunnerPay || 0)} />
            </StatColumn>

            <StatColumn label="Balances">
                <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-[var(--color-ink-soft)]">Overall Balance</dt>
                    <dd><BalanceValue value={summary.balances?.overallBalance} /></dd>
                </div>
                <StatLine
                    label={`Available CTP (${fmt(summary.derivedValues?.ctpTotal)}) + GRT (${fmt(summary.derivedValues?.grtTotal)})`}
                    value={fmt(availableNonCash)}
                />
                <StatLine label="Distributed CTP + GRT" value={fmt(distributedNonCash)} />
                <div className="mt-1 pt-2 border-t border-[var(--color-line)]">
                    <StatLine label="Total Team Points" value={summary.pointTotals?.totalAllTeamPoints || 0} strong />
                </div>
            </StatColumn>
        </div>
    );

    // No card box on the collapsed toggle itself - a bordered/tinted row here
    // reads as one more card stacked against the payout card right above it.
    // Just a quiet text row until opened; the detail grid below (`details`)
    // keeps its own box only once there is something to bound.
    return (
        <div>
            <button
                type="button"
                onClick={() => setIsOpen(prev => !prev)}
                className="w-full flex items-center justify-between gap-3 text-left"
                aria-expanded={isOpen}
            >
                <span className="text-xs text-[var(--color-ink-muted)]">
                    Shift audit · Available {fmt(availableNonCash)} · Distributed {fmt(distributedNonCash)}
                </span>
                <span className="shrink-0 flex items-center gap-2">
                    <BalanceValue value={summary.balances?.overallBalance} />
                    <span className="text-xs text-[var(--color-accent)]">{isOpen ? "Hide" : "Details"}</span>
                </span>
            </button>

            {isOpen ? (
                <div className="mt-3">
                    {details}
                </div>
            ) : null}
        </div>
    );
}

// Every payout on a saved night, flattened out of the engine's role buckets -
// only for reading the night back as a whole (NegativeNightNotice). The
// tables below still render group by group.
const allPayoutRows = (summary) => {
    const roleGrouped = summary?.payouts?.roleGrouped || {};
    return ROLE_GROUPS.flatMap(({ key }) => roleGrouped[key] || []);
};

// A small `radius-xs` chip - the kit's own role-tag shape (WorkspaceScreen.jsx
// `PayoutListRow`/desktop `TR`), not the app's usual full-pill Badge. The
// group band above each section already names the role, so this only ever
// carries the points - repeating "Captain" here too was the redundant half
// of "buried in other components": one more label saying the same word the
// band just said.
function PointsPill({ points }) {
    if (points == null) return null;
    return (
        <span className="inline-flex items-center whitespace-nowrap rounded-[var(--radius-xs)] bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-accent)]">
            {points} {plural(points, "pt", "pts")}
        </span>
    );
}

function PayoutMobileCards({ summary }) {
    const groupNames = summary.payouts?.roleGrouped || {};
    const totals = poolTotals(summary);

    return (
        <div className="hidden max-[560px]:block border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-surface)]">
            {ROLE_GROUPS.map(({ key, role, isRunner }) => {
                const arr = groupNames[key];
                if (!arr || arr.length === 0) return null;

                return (
                    <section key={key} className="border-b border-[var(--color-line)] last:border-b-0">
                        <div className="px-4 py-2 bg-[var(--color-surface-muted)]/65 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                            {rolePluralLabel(role)}
                        </div>
                        <div className="divide-y divide-[var(--color-line)]">
                            {arr.map((p) => {
                                const total = fmt(isRunner ? p.payoutAmount : getNonCashPayoutTotal(p));
                                const team = !isRunner && p.teamId ? p.teamId.replace("team-", "Team ") : null;
                                const detail = isRunner
                                    ? Object.entries(p.breakdown || {}).map(([src, val]) => `${runnerSourceLabel(src)}: ${fmt(val)}`).join(" · ")
                                    : `CTP ${fmt(p.ctp)} · GRT ${fmt(p.grt)} · Cash ${fmt(p.cash)}`;

                                return (
                                    <article key={p.uid} className="px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-semibold text-[var(--color-ink)] leading-tight">
                                                    {p.name}
                                                </h4>
                                                <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
                                                    {!isRunner ? <PointsPill points={p.points} /> : null}
                                                    {team ? <span>{team}</span> : null}
                                                </p>
                                            </div>
                                            <strong className="shrink-0 font-mono tabular-nums text-sm text-[var(--color-ink)]">
                                                {total}
                                            </strong>
                                        </div>
                                        <p className="mt-2 text-xs font-mono tabular-nums text-[var(--color-ink-soft)] leading-relaxed">
                                            {detail}
                                        </p>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface-muted)]/60 border-t border-[var(--color-line)]">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]">Everyone paid</span>
                <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">{fmt(totals.everyonePaid)}</strong>
            </div>
        </div>
    );
}

function PayoutTable({ summary }) {
    const groupNames = summary.payouts?.roleGrouped || {};
    const totals = poolTotals(summary);

    return (
        <div className="max-[560px]:hidden">
            <Table>
            <THead>
                <tr>
                    <TH>Employee</TH>
                    <TH numeric>CTP</TH>
                    <TH numeric>GRT</TH>
                    <TH numeric>Cash</TH>
                    <TH numeric>Total</TH>
                </tr>
            </THead>
            <TBody>
                {ROLE_GROUPS.map(({ key, role, isRunner }) => {
                    const arr = groupNames[key];
                    if (!arr || arr.length === 0) return null;
                    return (
                        <React.Fragment key={key}>
                            <tr className="bg-[var(--color-surface-muted)]/60">
                                <td colSpan={5} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                                    {rolePluralLabel(role)}
                                </td>
                            </tr>
                            {arr.map((p) => {
                                const team = !isRunner && p.teamId ? p.teamId.replace("team-", "Team ") : null;
                                return (
                                    <TR key={p.uid}>
                                        <TD>
                                            <span className="flex items-center gap-2 font-medium text-[var(--color-ink)]">
                                                {p.name}
                                                {!isRunner ? <PointsPill points={p.points} /> : null}
                                            </span>
                                            {team ? <span className="block text-xs text-[var(--color-ink-soft)]">{team}</span> : null}
                                        </TD>
                                        {isRunner ? (
                                            <td colSpan={3} className="px-4 py-3 text-xs text-[var(--color-ink-muted)] font-mono tabular-nums">
                                                {Object.entries(p.breakdown || {})
                                                    .map(([src, val]) => `${runnerSourceLabel(src)}: ${fmt(val)}`)
                                                    .join("  ·  ")}
                                            </td>
                                        ) : (
                                            <>
                                                <TD numeric>{fmt(p.ctp)}</TD>
                                                <TD numeric>{fmt(p.grt)}</TD>
                                                <TD numeric>{fmt(p.cash)}</TD>
                                            </>
                                        )}
                                        <TD numeric className="font-semibold">
                                            {fmt(isRunner ? p.payoutAmount : getNonCashPayoutTotal(p))}
                                        </TD>
                                    </TR>
                                );
                            })}
                        </React.Fragment>
                    );
                })}
                <tr className="border-t-2 border-[var(--color-line-strong)] bg-[var(--color-surface-muted)]/60">
                    <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]">
                        Everyone paid
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-sm font-semibold text-[var(--color-ink)]">
                        {fmt(totals.everyonePaid)}
                    </td>
                </tr>
            </TBody>
            </Table>
        </div>
    );
}

// Who last saved a settled day, and when. Both halves come off the shift doc -
// `updatedBy` resolved to a name upstream, `updatedAt` - and neither is inferred:
// this says "saved", not "settled", because `updatedAt` moves every time the day
// is corrected and only the record of the LAST save is kept.
//
// Two ordinary states, and neither is dressed as a problem. A night saved before
// these fields were recorded has no saver to name, so the line reads as the time
// alone; a night with no timestamp at all shows nothing rather than an apology
// for it. The people who reach this screen are the ones who ran the night, so
// this is a quiet fact at the top of it, not a banner.
//
// Named export: AdminDashboard renders this itself, next to the real date,
// in the page header above the day-chip strip - see that component's header
// for why.
export function SavedByLine({ savedBy }) {
    if (!savedBy?.at) return null;

    const savedAt = new Date(savedBy.at);
    if (Number.isNaN(savedAt.getTime())) return null;

    // The full date, not just the clock: a correction can be saved days after
    // the night it belongs to, and the heading above is the night's date.
    const when = savedAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

    return (
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            {savedBy.name ? `Saved by ${savedBy.name} · ` : "Saved "}
            {/* A long name at 320px wraps this line, and the break must not land
                inside the timestamp - "8:00" on one line and "AM" on the next is
                not a time. Held together, the wrap falls at the separator. */}
            <span className="whitespace-nowrap">{when}</span>
        </p>
    );
}

// The date and saved-by line live in AdminDashboard's own page header now,
// above the day-chip strip - not in here. This component is just the day's
// floating cards: the kit's `WorkspaceScreen.jsx` sits its pool tiles and its
// "Tonight's payout" card directly on the page, not inside one wrapping box,
// so nothing here is boxed a second time.
function DayPayoutPanel({ summary, status, loading }) {
    const visibleValidations = withoutNegativePoolWarnings(summary?.validations || []);

    if (loading) {
        return (
            <Card className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
                Loading…
            </Card>
        );
    }

    if (!summary && status === "setup") {
        return (
            <Card className="px-6 py-16 text-center">
                <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                </div>
                <p className="text-sm text-[var(--color-ink)]">Floor plan saved for this date.</p>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Continue to Settle up to enter the money and calculate the pay out.
                </p>
            </Card>
        );
    }

    if (!summary) {
        return (
            <Card className="px-6 py-16 text-center">
                <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                </div>
                <p className="text-sm text-[var(--color-ink)]">No shift saved for this date.</p>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Build the Floor plan to start the day.
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-5 sm:space-y-7">
            {/* Kit's headline pool-summary cards - the glanceable numbers,
                made honest for a real night's separate dining/bar pools. */}
            <PoolSummaryCards summary={summary} />

            {/* No "Reconciliation Warning" block here on purpose. It rendered
                `summary.payoutReconciliation`, an internal self-consistency check that
                the save path already hard-throws on with the same function and the same
                tolerance (closeoutPersistence.js `reconcilePayoutLedger`), so a shift
                that would trip it can never be written in the first place. It also
                competed for the word "reconciliation" with the captain's real one -
                comparing the app against the restaurant's spreadsheet, which lives in
                the pre-save Review spot check. */}

            {/* A saved night that records a negative amount says so in plain
                words, above the table where the minus sign appears - see the
                notice itself for why a negative is right and how it nets out
                weekly. It now reports the negative POOLS too, which is what let
                the engine's "…CTP pool is negative" strings come out of the red
                Warnings block below: the same correct night was being stated
                twice, the second time in the vocabulary of a fault. */}
            <NegativeNightNotice
                payoutRows={allPayoutRows(summary)}
                adjustedPools={summary.adjustedPools}
            />

            {/* Validations, minus the two negative-CTP-pool lines the notice
                above now states neutrally. Filtered for DISPLAY only: they are
                still in `summary.validations` on the saved document and the
                engine still emits them. Everything else this block ever carried
                it still carries, the negative RUNNER PAYOUT warning included -
                that is a different condition and belongs in red. */}
            {visibleValidations.length > 0 ? (
                <div className="px-4 py-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-[var(--radius-sm)]">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--color-danger)] mb-2">
                        Warnings
                    </h4>
                    <ul className="list-disc pl-5 text-sm text-[var(--color-ink)] space-y-0.5">
                        {visibleValidations.map((v, i) => (
                            <li key={i}>{v}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {/* Kit's own "Tonight's payout" card - a title beside a status
                badge, then the roster, floating on its own like the pool
                cards above it. */}
            <Card className="!p-0">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-line)] max-[560px]:px-4">
                    <h4 className="font-display text-[19px] font-medium tracking-tight text-[var(--color-ink)]">
                        Payout
                    </h4>
                    <Badge tone="success">Settled</Badge>
                </div>
                <PayoutMobileCards summary={summary} />
                <PayoutTable summary={summary} />
            </Card>

            {/* Full engine breakdown, tucked below the payout card as
                supporting evidence - see AuditSummary's own comment. */}
            <AuditSummary summary={summary} />
        </div>
    );
}

export default DayPayoutPanel;
