import React, { useMemo } from "react";
import styles from "./BiweeklySummary.module.css";
import { getBiweeklyPeriod, formatDate } from "../../utils/dateUtils";

function BiweeklySummary({ currentWeekData, currentWeekStart, viewMode, currentDate, allData }) {
    const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    // Helper: sum gratuity/tip/cash from a list of date keys
    const sumRange = (dateKeys) => {
        let gratuity = 0, tip = 0, cash = 0;
        dateKeys.forEach(dateKey => {
            const liveDay = currentWeekData?.find(d => d.dateKey === dateKey);
            const contextData = allData?.[dateKey];
            const source = liveDay || contextData || { gratuity: 0, tip: 0, cash: 0 };
            gratuity += Number(source.gratuity) || 0;
            tip += Number(source.tip) || 0;
            cash += Number(source.cash) || 0;
        });
        return { gratuity, tip, cash, total: gratuity + tip + cash };
    };

    // Generate date keys for a date range
    const getDateKeys = (start, end) => {
        const keys = [];
        const dayCount = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        for (let i = 0; i < dayCount; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            keys.push(d.toISOString().split('T')[0]);
        }
        return keys;
    };

    // WEEK VIEW: weekly totals for displayed week, biweekly totals for pay period
    // MONTH VIEW: monthly totals for the displayed month
    const { weekTotals, biweeklyTotals, weekStart, weekEnd, biStart, biEnd, displayStart, displayEnd } = useMemo(() => {
        if (viewMode === 'month' && currentDate) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const monthStart = new Date(year, month, 1);
            const monthEnd = new Date(year, month + 1, 0);
            const monthKeys = getDateKeys(monthStart, monthEnd);
            const monthSums = sumRange(monthKeys);
            return {
                weekTotals: monthSums,
                biweeklyTotals: monthSums,
                weekStart: monthStart,
                weekEnd: monthEnd,
                biStart: monthStart,
                biEnd: monthEnd,
                displayStart: monthStart,
                displayEnd: monthEnd,
            };
        }

        // Week view
        if (!currentWeekStart) {
            const empty = { gratuity: 0, tip: 0, cash: 0, total: 0 };
            const now = new Date();
            return { weekTotals: empty, biweeklyTotals: empty, weekStart: now, weekEnd: now, biStart: now, biEnd: now, displayStart: now, displayEnd: now };
        }

        // Current displayed week (7 days: Fri-Thu)
        const wStart = new Date(currentWeekStart);
        wStart.setHours(0, 0, 0, 0);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        const weekKeys = getDateKeys(wStart, wEnd);
        const wTotals = sumRange(weekKeys);

        // Biweekly pay period (14 days)
        const { start: bStart, end: bEnd } = getBiweeklyPeriod(currentWeekStart);
        const biKeys = getDateKeys(bStart, bEnd);
        const bTotals = sumRange(biKeys);

        return {
            weekTotals: wTotals,
            biweeklyTotals: bTotals,
            weekStart: wStart,
            weekEnd: wEnd,
            biStart: bStart,
            biEnd: bEnd,
            displayStart: wStart,
            displayEnd: wEnd,
        };
    }, [currentWeekData, currentWeekStart, viewMode, currentDate, allData]);

    const dayCount = Math.round((displayEnd - displayStart) / (1000 * 60 * 60 * 24)) + 1;
    const averageDaily = dayCount > 0 ? weekTotals.total / dayCount : 0;

    return (
        <div className={styles.summary}>
            <div className={styles.header}>
                <h2 className={styles.title}>{viewMode === 'month' ? 'MONTHLY SUMMARY' : 'FINANCIAL SUMMARY'}</h2>
                <div className={styles.subtitle}>
                    {formatDate(displayStart)} - {formatDate(displayEnd)}
                </div>
            </div>

            <div className={styles.content}>
                <div className={styles.row}><span>Total gratuity</span><span>{fmt(weekTotals.gratuity)}</span></div>
                <div className={styles.row}><span>Total tip</span><span>{fmt(weekTotals.tip)}</span></div>
                <div className={styles.row}><span>Total cash</span><span>{fmt(weekTotals.cash)}</span></div>

                <div className={styles.divider} />

                <div className={styles.row}><span>Average Daily</span><span>{fmt(averageDaily)}</span></div>
                <div className={styles.row}>
                    <span>{viewMode === 'month' ? 'Proj. Month' : 'Proj. Biweekly'} ({formatDate(biStart)} - {formatDate(biEnd)})</span>
                    <span>{fmt(biweeklyTotals.total)}</span>
                </div>

                <div className={styles.totalRow}>
                    <span>{viewMode === 'month' ? 'Month Total' : 'Week Total'}</span>
                    <strong>{fmt(weekTotals.total)}</strong>
                </div>
            </div>
        </div>
    );
}

export default BiweeklySummary;
