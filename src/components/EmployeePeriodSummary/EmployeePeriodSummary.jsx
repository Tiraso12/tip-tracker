import React, { useMemo, useState } from "react";
import { formatMonthDay, formatMonthDayRange, getBiweeklyPeriod } from "../../utils/dateUtils";
import {
    buildEmployeePeriodSummary,
    fmtMoney,
    getDateKeys,
    getNonCashDayTotal,
} from "../../utils/employeeSummary";
import { Card } from "../ui";

const roleLabels = {
    captain: "Captain",
    server: "Server",
    back: "Back Server",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

function StatBlock({ label, value, hint, accent = false }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                {label}
            </span>
            <strong
                className={
                    "font-display text-2xl font-medium tracking-tight tabular-nums " +
                    (accent ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]")
                }
            >
                {value}
            </strong>
            {hint ? (
                <span className="text-[11px] font-mono tabular-nums text-[var(--color-ink-muted)]">
                    {hint}
                </span>
            ) : null}
        </div>
    );
}

function MetricRow({ label, value }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-2 border-b border-[var(--color-line)] last:border-0">
            <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
                {label}
            </span>
            <span className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                {value}
            </span>
        </div>
    );
}

function SummaryColumn({ label, value, hint, accent = false, totals }) {
    return (
        <div className="px-6 py-5">
            <StatBlock label={label} value={value} hint={hint} accent={accent} />
            <div className="mt-4">
                <MetricRow label="Cash" value={fmtMoney(totals.cash)} />
                <MetricRow label="Gratuity" value={fmtMoney(totals.gratuity)} />
                <MetricRow label="Tip" value={fmtMoney(totals.tip)} />
            </div>
        </div>
    );
}

const getNonCashTotal = (entries) =>
    entries.reduce((sum, entry) => sum + getNonCashDayTotal(entry), 0);

function EmployeePeriodSummary({ currentDate, currentWeekStart, currentWeekEnd, allData }) {
    const [isOpen, setIsOpen] = useState(false);
    const period = useMemo(() => getBiweeklyPeriod(currentDate || new Date()), [currentDate]);
    const summary = useMemo(() => {
        const keys = getDateKeys(period.start, period.end);
        return buildEmployeePeriodSummary(allData, keys);
    }, [allData, period.end, period.start]);
    const weekSummary = useMemo(() => {
        const keys = getDateKeys(currentWeekStart, currentWeekEnd);
        return buildEmployeePeriodSummary(allData, keys);
    }, [allData, currentWeekEnd, currentWeekStart]);
    const weekNonCashTotal = getNonCashTotal(weekSummary.workedEntries);
    const payPeriodNonCashTotal = getNonCashTotal(summary.workedEntries);
    const averageNonCashShift =
        weekSummary.workedEntries.length > 0 ? weekNonCashTotal / weekSummary.workedEntries.length : 0;
    const bestNonCashDay = weekSummary.workedEntries.reduce((best, entry) => {
        if (!best || getNonCashDayTotal(entry) > getNonCashDayTotal(best)) return entry;
        return best;
    }, null);

    const topRoles = Object.entries(summary.roleCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => `${roleLabels[role] || role} · ${count} ${count === 1 ? "shift" : "shifts"}`)
        .join(" · ");

    const weekLabel =
        currentWeekStart && currentWeekEnd
            ? formatMonthDayRange(currentWeekStart, currentWeekEnd)
            : "Current week";
    const periodLabel = formatMonthDayRange(period.start, period.end);
    const periodDays = Math.round((period.end - period.start) / (24 * 60 * 60 * 1000)) + 1;
    const periodWeeks = Math.round(periodDays / 7);
    const periodHint = `${periodLabel} · ${periodWeeks} ${periodWeeks === 1 ? "week" : "weeks"}`;
    const adviceDate = new Date(period.end);
    adviceDate.setDate(period.end.getDate() + 7);
    const summaryContentId = "employee-period-summary-content";

    return (
        <Card className="!p-0">
            {/* Header */}
            <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 px-6 py-5 border-b border-[var(--color-line)] max-[560px]:hidden">
                <div>
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Earnings Summary
                    </span>
                    <p className="mt-1 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                        {periodHint}
                    </p>
                </div>
            </header>

            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                className="hidden max-[560px]:flex w-full items-start justify-between gap-4 px-4 py-4 text-left border-b border-[var(--color-line)] bg-[var(--color-surface)]"
                aria-expanded={isOpen}
                aria-controls={summaryContentId}
            >
                <div className="min-w-0">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Earnings Summary
                    </span>
                    <p className="mt-1 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                        {periodHint}
                    </p>
                    <div className={(isOpen ? "hidden " : "grid ") + "mt-3 grid-cols-1 gap-1.5 text-[0.72rem] min-[390px]:grid-cols-2"}>
                        <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] px-2.5 py-2">
                            <span className="block text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                                Week
                            </span>
                            <span className="mt-0.5 block font-mono tabular-nums text-[var(--color-ink-soft)]">
                                {weekLabel} · {fmtMoney(weekNonCashTotal)}
                            </span>
                            <span className="mt-0.5 block font-mono tabular-nums text-[var(--color-ink-muted)]">
                                Cash {fmtMoney(weekSummary.totals.cash)}
                            </span>
                        </span>
                        <span className="rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] px-2.5 py-2">
                            <span className="block text-[10px] font-medium uppercase tracking-wide text-[var(--color-accent)]/75">
                                Period
                            </span>
                            <span className="mt-0.5 block font-mono tabular-nums text-[var(--color-accent)]">
                                {periodLabel} · {fmtMoney(payPeriodNonCashTotal)}
                            </span>
                            <span className="mt-0.5 block font-mono tabular-nums text-[var(--color-accent)]/75">
                                Advice {formatMonthDay(adviceDate)}
                            </span>
                        </span>
                    </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-xs font-medium text-[var(--color-accent)]">
                        {isOpen ? "Hide" : "Details"}
                    </span>
                    <svg
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

            <div id={summaryContentId} className={isOpen ? "" : "max-[560px]:hidden"}>
                {/* Week vs pay-period totals */}
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-line)]">
                    <SummaryColumn
                        label="Week"
                        value={fmtMoney(weekNonCashTotal)}
                        hint={weekLabel}
                        totals={weekSummary.totals}
                    />
                    <SummaryColumn
                        label="Pay Period"
                        value={fmtMoney(payPeriodNonCashTotal)}
                        hint={periodHint}
                        totals={summary.totals}
                        accent
                    />
                </div>

                {/* Weekly metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-[var(--color-line)] divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-line)]">
                    <div className="px-6 py-4">
                        <StatBlock label="Average" value={fmtMoney(averageNonCashShift)} />
                    </div>
                    <div className="px-6 py-4">
                        <StatBlock
                            label="Best Day"
                            value={bestNonCashDay ? fmtMoney(getNonCashDayTotal(bestNonCashDay)) : "$0.00"}
                        />
                    </div>
                </div>

                {/* Footer line */}
                <div className="px-6 py-3 bg-[var(--color-surface-muted)]/40 border-t border-[var(--color-line)]">
                    {summary.workedDays === 0 ? (
                        <p className="text-xs text-[var(--color-ink-muted)] italic">
                            No saved payouts in this pay period yet.
                        </p>
                    ) : (
                        <p className="text-xs text-[var(--color-ink-soft)]">
                            {topRoles || "Role details will appear after the next saved shift."}
                        </p>
                    )}
                </div>
            </div>
        </Card>
    );
}

export default EmployeePeriodSummary;
