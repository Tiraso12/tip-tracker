import React, { useState } from "react";
import { generateShiftReport } from "../../utils/pdfExport";
import { Button, Card, Table, THead, TBody, TR, TH, TD } from "../ui";
import { rolePluralLabel, roleShortLabel } from "../../utils/roleLabels";
import NegativeNightNotice from "./NegativeNightNotice";

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;
// singular/plural helper, matching the `member`/`members` pattern in TeamDropZone.
const plural = (count, one, many) => (count === 1 ? one : many);
// Display-only relabel of the engine's internal breakdown keys into captain
// vocabulary (the engine key stays "Manual Split"; only the shown label changes).
const RUNNER_SOURCE_LABELS = { "Manual Split": "Runner pay" };
const runnerSourceLabel = (src) => RUNNER_SOURCE_LABELS[src] || src;
const getNonCashPayoutTotal = (payout = {}) => (Number(payout.ctp) || 0) + (Number(payout.grt) || 0);

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

// `key` is the engine's roleGrouped bucket (engine.js); the heading is the role's
// group name from the shared label source, so a payout heading and a floor-plan
// filter chip can never drift apart.
const ROLE_GROUPS = [
    { key: "captains", role: "captain" },
    { key: "servers", role: "server" },
    { key: "backs", role: "back" },
    { key: "assistants", role: "assistant" },
    { key: "bar", role: "bartender" },
    { key: "runners", role: "runner", isRunner: true },
].map(group => ({ ...group, label: rolePluralLabel(group.role) }));

// Every payout on a saved night, flattened out of the engine's role buckets. Only for
// reading the night back as a whole - the table below still renders group by group.
const allPayoutRows = (summary) => {
    const roleGrouped = summary?.payouts?.roleGrouped || {};
    return ROLE_GROUPS.flatMap(({ key }) => roleGrouped[key] || []);
};

function AuditSummary({ summary }) {
    const [isOpen, setIsOpen] = useState(false);
    const availableNonCash = (summary.balances?.totalAvailable || 0) - (summary.derivedValues?.baseTeamCash || 0);
    const distributedNonCash = (summary.balances?.totalDistributed || 0) - (summary.derivedValues?.baseTeamCash || 0);

    const details = (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5 bg-[var(--color-surface-muted)]/50 border border-[var(--color-line)] rounded-[var(--radius-md)] max-[560px]:border-0 max-[560px]:p-0 max-[560px]:bg-transparent max-[560px]:gap-4">
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

    return (
        <>
            <div className="max-[560px]:hidden">
                {details}
            </div>

            <div className="hidden max-[560px]:block border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface-muted)]/45 overflow-hidden">
                <button
                    type="button"
                    onClick={() => setIsOpen(prev => !prev)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
                    aria-expanded={isOpen}
                >
                    <div className="min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                            Shift Audit
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[0.72rem] text-[var(--color-ink-soft)]">
                            <span className="rounded-full bg-[var(--color-surface)] px-2 py-1">
                                Available {fmt(availableNonCash)}
                            </span>
                            <span className="rounded-full bg-[var(--color-surface)] px-2 py-1">
                                Distributed {fmt(distributedNonCash)}
                            </span>
                        </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">Balance</span>
                        <BalanceValue value={summary.balances?.overallBalance} />
                        <span className="text-xs text-[var(--color-accent)]">{isOpen ? "Hide" : "Details"}</span>
                    </div>
                </button>

                {isOpen ? (
                    <div className="px-4 pb-4">
                        {details}
                    </div>
                ) : null}
            </div>
        </>
    );
}

function PayoutMobileCards({ summary }) {
    const groupNames = summary.payouts?.roleGrouped || {};

    return (
        <div className="hidden max-[560px]:block border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-surface)]">
            {ROLE_GROUPS.map(({ key, label, isRunner }) => {
                const arr = groupNames[key];
                if (!arr || arr.length === 0) return null;

                return (
                    <section key={key} className="border-b border-[var(--color-line)] last:border-b-0">
                        <div className="px-4 py-2 bg-[var(--color-surface-muted)]/65 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                            {label}
                        </div>
                        <div className="divide-y divide-[var(--color-line)]">
                            {arr.map((p) => {
                                const total = fmt(isRunner ? p.payoutAmount : getNonCashPayoutTotal(p));
                                const team = isRunner ? roleShortLabel("runner") : p.teamId ? p.teamId.replace("team-", "Team ") : roleShortLabel("bartender");
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
                                                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                                                    {isRunner ? team : `${team} · ${p.points ?? 0} ${plural(p.points ?? 0, 'pt', 'pts')}`}
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
        </div>
    );
}

function PayoutTable({ summary }) {
    const groupNames = summary.payouts?.roleGrouped || {};

    return (
        <div className="max-[560px]:hidden">
            <Table>
            <THead>
                <tr>
                    <TH>Employee</TH>
                    <TH>{summary.payouts?.roleGrouped ? "Team Worked" : "Role"}</TH>
                    <TH numeric>Points</TH>
                    <TH numeric>CTP</TH>
                    <TH numeric>GRT</TH>
                    <TH numeric>Cash</TH>
                    <TH numeric>Total (CTP+GRT)</TH>
                </tr>
            </THead>
            <TBody>
                {ROLE_GROUPS.map(({ key, label, isRunner }) => {
                    const arr = groupNames[key];
                    if (!arr || arr.length === 0) return null;
                    return (
                        <React.Fragment key={key}>
                            <tr className="bg-[var(--color-surface-muted)]/60">
                                <td colSpan={7} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                                    {label}
                                </td>
                            </tr>
                            {arr.map((p) => (
                                <TR key={p.uid}>
                                    <TD className="font-medium">{p.name}</TD>
                                    <TD className="text-[var(--color-ink-soft)]">
                                        {isRunner ? roleShortLabel("runner") : p.teamId ? p.teamId.replace("team-", "Team ") : roleShortLabel("bartender")}
                                    </TD>
                                    {isRunner ? (
                                        <td colSpan={4} className="px-4 py-3 text-xs text-[var(--color-ink-muted)] font-mono tabular-nums">
                                            {Object.entries(p.breakdown || {})
                                                .map(([src, val]) => `${runnerSourceLabel(src)}: ${fmt(val)}`)
                                                .join("  ·  ")}
                                        </td>
                                    ) : (
                                        <>
                                            <TD numeric>{p.points}</TD>
                                            <TD numeric>{fmt(p.ctp)}</TD>
                                            <TD numeric>{fmt(p.grt)}</TD>
                                            <TD numeric>{fmt(p.cash)}</TD>
                                        </>
                                    )}
                                    <TD numeric className="font-semibold">
                                        {fmt(isRunner ? p.payoutAmount : getNonCashPayoutTotal(p))}
                                    </TD>
                                </TR>
                            ))}
                        </React.Fragment>
                    );
                })}
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
function SavedByLine({ savedBy }) {
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

function DayPayoutPanel({ date, summary, status, savedBy = null, loading }) {
    const displayDate = (() => {
        const [y, m, d] = date.split("-");
        return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    })();

    return (
        <Card className="!p-0">
            <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[var(--color-line)] max-[560px]:px-4">
                <div className="min-w-0">
                    <h3 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                        {displayDate}
                    </h3>
                    {/* Only on a settled day: before the money is saved there is
                        nothing to have saved, and the empty states below say so. */}
                    {summary ? <SavedByLine savedBy={savedBy} /> : null}
                </div>
                {summary ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        onClick={() => generateShiftReport(date, summary)}
                    >
                        Export PDF
                    </Button>
                ) : null}
            </header>

            {loading ? (
                <div className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
                    Loading…
                </div>
            ) : !summary && status === "setup" ? (
                <div className="px-6 py-16 text-center">
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
                </div>
            ) : !summary ? (
                <div className="px-6 py-16 text-center">
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
                </div>
            ) : (
                <div className="px-6 py-6 space-y-6 max-[560px]:px-4 max-[560px]:py-4 max-[560px]:space-y-4">
                    {/* Summary bar */}
                    <AuditSummary summary={summary} />

                    {/* No "Reconciliation Warning" block here on purpose. It rendered
                        `summary.payoutReconciliation`, an internal self-consistency check that
                        the save path already hard-throws on with the same function and the same
                        tolerance (closeoutPersistence.js `reconcilePayoutLedger`), so a shift
                        that would trip it can never be written in the first place. It also
                        competed for the word "reconciliation" with the captain's real one -
                        comparing the app against the restaurant's spreadsheet, which lives in
                        the pre-save Review spot check. */}

                    {/* A saved night that records someone at a negative amount says so
                        in plain words, above the table where the minus sign appears.
                        It sits ABOVE the Warnings block on purpose: the engine's own
                        "Bar CTP pool is negative" lands in that block in danger red,
                        and read alone it frames a correct night as a fault. This is the
                        explanation that makes it read as what it is - see the notice
                        itself for why a negative is right and how it nets out weekly. */}
                    <NegativeNightNotice payoutRows={allPayoutRows(summary)} />

                    {/* Validations */}
                    {summary.validations && summary.validations.length > 0 ? (
                        <div className="px-4 py-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-[var(--radius-sm)]">
                            <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--color-danger)] mb-2">
                                Warnings
                            </h4>
                            <ul className="list-disc pl-5 text-sm text-[var(--color-ink)] space-y-0.5">
                                {summary.validations.map((v, i) => (
                                    <li key={i}>{v}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {/* Payout table */}
                    <PayoutMobileCards summary={summary} />
                    <PayoutTable summary={summary} />
                </div>
            )}
        </Card>
    );
}

export default DayPayoutPanel;
