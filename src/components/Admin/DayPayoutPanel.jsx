import React, { useState } from "react";
import { generateShiftReport } from "../../utils/pdfExport";
import { Button, Card, Table, THead, TBody, TR, TH, TD } from "../ui";

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;
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

const ROLE_GROUPS = [
    { key: "captains", label: "Captains" },
    { key: "servers", label: "Servers" },
    { key: "backs", label: "Backs" },
    { key: "assistants", label: "Assistants" },
    { key: "bar", label: "Bar Team" },
    { key: "runners", label: "Runners", isRunner: true },
];

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
                <StatLine label="Runners Fee" value={fmt(summary.allocations?.totalRunnerPay || 0)} />
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
                                const team = isRunner ? "Runner" : p.teamId ? p.teamId.replace("team-", "Team ") : "Bar";
                                const detail = isRunner
                                    ? Object.entries(p.breakdown || {}).map(([src, val]) => `${src}: ${fmt(val)}`).join(" · ")
                                    : `CTP ${fmt(p.ctp)} · GRT ${fmt(p.grt)} · Cash ${fmt(p.cash)}`;

                                return (
                                    <article key={p.uid} className="px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-semibold text-[var(--color-ink)] leading-tight">
                                                    {p.name}
                                                </h4>
                                                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                                                    {isRunner ? team : `${team} · ${p.points ?? 0} pts`}
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
                                        {isRunner ? "Runner" : p.teamId ? p.teamId.replace("team-", "Team ") : "Bar"}
                                    </TD>
                                    {isRunner ? (
                                        <td colSpan={4} className="px-4 py-3 text-xs text-[var(--color-ink-muted)] font-mono tabular-nums">
                                            {Object.entries(p.breakdown || {})
                                                .map(([src, val]) => `${src}: ${fmt(val)}`)
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

function DayPayoutPanel({ date, summary, status, loading }) {
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
            <header className="flex items-center justify-between gap-3 px-6 py-5 border-b border-[var(--color-line)]">
                <h3 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                    {displayDate}
                </h3>
                {summary ? (
                    <Button
                        variant="secondary"
                        size="sm"
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
                    <p className="text-sm text-[var(--color-ink)]">Team setup saved for this date.</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                        Open the shift editor to adjust the team or complete money closeout.
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
                        Open the shift editor to input and calculate payouts.
                    </p>
                </div>
            ) : (
                <div className="px-6 py-6 space-y-6 max-[560px]:px-4 max-[560px]:py-4 max-[560px]:space-y-4">
                    {/* Summary bar */}
                    <AuditSummary summary={summary} />

                    {/* Reconciliation */}
                    {summary.payoutReconciliation && !summary.payoutReconciliation.ok ? (
                        <div className="px-4 py-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-[var(--radius-sm)]">
                            <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--color-danger)] mb-2">
                                Reconciliation Warning
                            </h4>
                            <ul className="list-disc pl-5 text-sm text-[var(--color-ink)] space-y-0.5">
                                {summary.payoutReconciliation.messages.map((message, i) => (
                                    <li key={i}>{message}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

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
