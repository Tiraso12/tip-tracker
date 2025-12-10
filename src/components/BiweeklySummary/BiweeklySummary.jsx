import React, { useMemo } from "react";
import styles from "./BiweeklySummary.module.css";
import { getBiweeklyPeriod, formatDate } from "../../utils/dateUtils";
import { calculatePeriodTotals } from "../../utils/calculations";

function BiweeklySummary({ currentWeekData, currentWeekStart }) {
    // We need to calculate the period based on the current week's start date
    // Assuming currentWeekStart is a Date object.
    // Actually, getBiweeklyPeriod takes any date and finds the period it belongs to.
    // But care: if we view a week that spans two periods?
    // Current logic: the user is viewing a specific week. We should show the period THAT week belongs to.
    // Or if the week splits across periods? 
    // Our weeks are Fri-Thu. Periods are Fri-Thu (2 weeks).
    // Since specific anchor is Nov 21 (Fri), and periods are 14 days, they always align with the Fri-Thu weeks.
    // So a generic "Current Week" will always fall entirely within one Biweekly Period.

    const { start, end } = useMemo(() => {
        if (!currentWeekStart) return { start: new Date(), end: new Date() };
        return getBiweeklyPeriod(currentWeekStart);
    }, [currentWeekStart]);

    const totals = useMemo(() => {
        return calculatePeriodTotals(currentWeekData, start, end);
    }, [start, end, currentWeekData]);


    const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    return (
        <div className={styles.summary}>
            <div className={styles.header}>
                <h2 className={styles.title}>FINANCIAL SUMMARY</h2>
                <div className={styles.subtitle}>
                    {formatDate(start)} - {formatDate(end)}
                </div>
            </div>

            <div className={styles.content}>
                <div className={styles.row}><span>Total gratuity</span><span>{fmt(totals.gratuity)}</span></div>
                <div className={styles.row}><span>Total tip</span><span>{fmt(totals.tip)}</span></div>
                <div className={styles.row}><span>Total cash</span><span>{fmt(totals.cash)}</span></div>

                <div className={styles.divider}></div>

                <div className={styles.row}><span>Average Daily</span><span>{fmt(totals.averageDaily || 0)}</span></div>
                <div className={styles.row}><span>Proj. Biweekly</span><span>{fmt(totals.projected || 0)}</span></div>

                <div className={styles.totalRow}><span>Period Total</span><strong>{fmt(totals.total)}</strong></div>
            </div>
        </div>
    );
}

export default BiweeklySummary;
