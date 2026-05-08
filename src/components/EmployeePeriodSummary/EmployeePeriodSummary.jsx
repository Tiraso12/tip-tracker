import React, { useMemo } from "react";
import styles from "./EmployeePeriodSummary.module.css";
import { formatDate, getBiweeklyPeriod } from "../../utils/dateUtils";
import { buildEmployeePeriodSummary, fmtMoney, getDateKeys, getDayTotal } from "../../utils/employeeSummary";

const roleLabels = {
    captain: "Captain",
    server: "Server",
    back: "Back Server",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

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

    const topRoles = Object.entries(summary.roleCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => `${roleLabels[role] || role}: ${count} ${count === 1 ? "shift" : "shifts"}`)
        .join(" / ");
    const weekLabel = currentWeekStart && currentWeekEnd
        ? `${formatDate(currentWeekStart)} - ${formatDate(currentWeekEnd)}`
        : "Current week";

    return (
        <section className={styles.panel} aria-label="Pay period summary">
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>EARNINGS SUMMARY</h2>
                    <p className={styles.subtitle}>{formatDate(period.start)} - {formatDate(period.end)}</p>
                </div>
                <div className={styles.totalsGrid}>
                    <div className={styles.total}>
                        <span>This Week</span>
                        <strong>{fmtMoney(weekSummary.totals.total)}</strong>
                        <small>{weekLabel}</small>
                    </div>
                    <div className={styles.total}>
                        <span>Pay Period</span>
                        <strong>{fmtMoney(summary.totals.total)}</strong>
                        <small>{formatDate(period.start)} - {formatDate(period.end)}</small>
                    </div>
                </div>
            </div>

            <div className={styles.metrics}>
                <div className={styles.metric}>
                    <span>Worked Shifts</span>
                    <strong>{summary.workedDays}</strong>
                </div>
                <div className={styles.metric}>
                    <span>Average Shift</span>
                    <strong>{fmtMoney(summary.averageShift)}</strong>
                </div>
                <div className={styles.metric}>
                    <span>Best Day</span>
                    <strong>{summary.bestDay ? fmtMoney(getDayTotal(summary.bestDay)) : "$0.00"}</strong>
                </div>
            </div>

            <div className={styles.breakdown}>
                <div><span>Gratuity</span><strong>{fmtMoney(summary.totals.gratuity)}</strong></div>
                <div><span>Tip</span><strong>{fmtMoney(summary.totals.tip)}</strong></div>
                <div><span>Cash</span><strong>{fmtMoney(summary.totals.cash)}</strong></div>
            </div>

            {summary.workedDays === 0 ? (
                <p className={styles.empty}>No saved payouts in this pay period yet.</p>
            ) : (
                <p className={styles.roles}>{topRoles || "Role details will appear after the next saved shift."}</p>
            )}
        </section>
    );
}

export default EmployeePeriodSummary;
