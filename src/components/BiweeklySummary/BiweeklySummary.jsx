import React, { useMemo } from "react";
import styles from "./BiweeklySummary.module.css";
import { getBiweeklyPeriod, formatDate } from "../../utils/dateUtils";

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
        if (!start || !currentWeekData) return { gratuity: 0, tip: 0, cash: 0, total: 0 };

        // 1. Get all 14 date strings for the period
        const dates = [];
        for (let i = 0; i < 14; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }

        // 2. Load all saved data once (synchronous read is okay for small data)
        const savedJSON = localStorage.getItem("tip-tracker-data");
        const savedData = savedJSON ? JSON.parse(savedJSON) : {};

        // 3. Sum up
        let totalGratuity = 0;
        let totalTip = 0;
        let totalCash = 0;

        dates.forEach(dateKey => {
            // Check if this date is in the currently edited weekData
            // (currentWeekData is array of objects with .dateKey)
            const liveDay = currentWeekData.find(d => d.dateKey === dateKey);

            if (liveDay) {
                totalGratuity += Number(liveDay.gratuity) || 0;
                totalTip += Number(liveDay.tip) || 0;
                totalCash += Number(liveDay.cash) || 0;
            } else {
                // Use saved data
                const dayData = savedData[dateKey];
                if (dayData) {
                    totalGratuity += Number(dayData.gratuity) || 0;
                    totalTip += Number(dayData.tip) || 0;
                    totalCash += Number(dayData.cash) || 0;
                }
            }
        });

        return {
            gratuity: totalGratuity,
            tip: totalTip,
            cash: totalCash,
            total: totalGratuity + totalTip + totalCash
        };

    }, [start, end, currentWeekData]);


    const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    return (
        <div className={styles.summary}>
            <h2 className={styles.title}>Biweekly Summary</h2>
            <div className={styles.subtitle}>
                {formatDate(start)} - {formatDate(end)}
            </div>
            <div className={styles.row}><span>Total gratuity</span><span>{fmt(totals.gratuity)}</span></div>
            <div className={styles.row}><span>Total tip</span><span>{fmt(totals.tip)}</span></div>
            <div className={styles.row}><span>Total cash</span><span>{fmt(totals.cash)}</span></div>
            <div className={styles.row}><span>Period Total</span><strong>{fmt(totals.total)}</strong></div>
        </div>
    );
}

export default BiweeklySummary;
