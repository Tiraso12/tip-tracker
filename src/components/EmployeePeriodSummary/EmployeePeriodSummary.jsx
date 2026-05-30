import React, { useMemo } from "react";
import { formatDate, getBiweeklyPeriod } from "../../utils/dateUtils";
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
            <span className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                {label}
            </span>
            <span className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                {value}
            </span>
        </div>
    );
}

function EmployeePeriodSummary({ currentDate, currentWeekStart, currentWeekEnd, allData }) {
    const period = useMemo(() => getBiweeklyPeriod(currentDate || new Date()), [currentDate]);
    const summary = useMemo(() => {
        const keys = getDateKeys(period.start, period.end);
        return buildEmployeePeriodSummary(allData, keys);
    }, [allData, period.end, period.start]);
    const weekSummary = useMemo(() => {
        const keys = getDateKeys(currentWeekStart, currentWeekEnd);
        return buildEmployeePeriodSummary(allData, keys);
    }, [allData, currentWeekEnd, currentWeekStart]);
    const thisWeekNonCashTotal = weekSummary.workedEntries.reduce(
        (sum, entry) => sum + getNonCashDayTotal(entry),
        0
    );
    const payPeriodNonCashTotal = summary.workedEntries.reduce(
        (sum, entry) => sum + getNonCashDayTotal(entry),
        0
    );
    const averageNonCashShift =
        summary.workedEntries.length > 0 ? payPeriodNonCashTotal / summary.workedEntries.length : 0;
    const bestNonCashDay = summary.workedEntries.reduce((best, entry) => {
        if (!best || getNonCashDayTotal(entry) > getNonCashDayTotal(best)) return entry;
        return best;
    }, null);

    const topRoles = Object.entries(summary.roleCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => `${roleLabels[role] || role}: ${count} ${count === 1 ? "shift" : "shifts"}`)
        .join(" · ");

    const weekLabel =
        currentWeekStart && currentWeekEnd
            ? `${formatDate(currentWeekStart)} – ${formatDate(currentWeekEnd)}`
            : "Current week";
    const periodLabel = `${formatDate(period.start)} – ${formatDate(period.end)}`;

    return (
        <Card className="!p-0">
            {/* Header */}
            <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 px-6 py-5 border-b border-[var(--color-line)]">
                <div>
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Earnings Summary
                    </span>
                    <p className="mt-1 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                        {periodLabel}
                    </p>
                </div>
            </header>

            {/* Headline totals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-line)]">
                <div className="px-6 py-5">
                    <StatBlock
                        label="This Week"
                        value={fmtMoney(thisWeekNonCashTotal)}
                        hint={weekLabel}
                    />
                </div>
                <div className="px-6 py-5">
                    <StatBlock
                        label="Pay Period"
                        value={fmtMoney(payPeriodNonCashTotal)}
                        hint={periodLabel}
                        accent
                    />
                </div>
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-[var(--color-line)] divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-line)]">
                <div className="px-6 py-4">
                    <StatBlock label="Worked Shifts" value={summary.workedDays} />
                </div>
                <div className="px-6 py-4">
                    <StatBlock label="Average Shift" value={fmtMoney(averageNonCashShift)} />
                </div>
                <div className="px-6 py-4">
                    <StatBlock
                        label="Best Day"
                        value={bestNonCashDay ? fmtMoney(getNonCashDayTotal(bestNonCashDay)) : "$0.00"}
                    />
                </div>
            </div>

            {/* Source breakdown */}
            <div className="px-6 py-4 border-t border-[var(--color-line)]">
                <MetricRow label="Gratuity" value={fmtMoney(summary.totals.gratuity)} />
                <MetricRow label="Tip" value={fmtMoney(summary.totals.tip)} />
                <MetricRow label="Cash" value={fmtMoney(summary.totals.cash)} />
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
        </Card>
    );
}

export default EmployeePeriodSummary;
