import React, { useMemo, useEffect, useState } from "react";
import styles from "./BiweeklySummary.module.css";
import { getBiweeklyPeriod, formatDate } from "../../utils/dateUtils";
import DataService from "../../services/dataService";

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

    const [totals, setTotals] = useState({ gratuity: 0, tip: 0, cash: 0, total: 0 });

    useEffect(() => {
        if (!start) return;

        const calculateTotals = async () => {
            // 1. Get all 14 date strings for the period
            const dates = [];
            for (let i = 0; i < 14; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                dates.push(d.toISOString().split('T')[0]);
            }

            // 2. Load all saved data asynchronously
            // We fetch the latest from the service. 
            // Note: This won't reflect unsaved changes in the App component immediately unless we lift state up or subscribe.
            // For now, consistent with previous behavior (saved data), we fetch from service.
            // Ideally, 'currentWeekData' passed as prop should override fetched data for the current view.

            const serviceData = await DataService.getRange(dates);

            // 3. Sum up
            let totalGratuity = 0;
            let totalTip = 0;
            let totalCash = 0;

            dates.forEach(dateKey => {
                // Check if this date is in the currently edited weekData
                // (currentWeekData is array of objects with .dateKey)
                const liveDay = currentWeekData?.find(d => d.dateKey === dateKey);

                if (liveDay) {
                    totalGratuity += Number(liveDay.gratuity) || 0;
                    totalTip += Number(liveDay.tip) || 0;
                    totalCash += Number(liveDay.cash) || 0;
                } else {
                    // Use saved data
                    const dayData = serviceData[dateKey];
                    if (dayData) {
                        totalGratuity += Number(dayData.gratuity) || 0;
                        totalTip += Number(dayData.tip) || 0;
                        totalCash += Number(dayData.cash) || 0;
                    }
                }
            });

            const total = totalGratuity + totalTip + totalCash;

            // Feature-ui logic:
            // const daysWithData = Math.max(1, dates.length); 
            // averageDaily: total / 14
            // projected: (total / daysWithData) * 14 -> This logic simplifies to just total if daysWithData is 14.
            // Wait, calculatePeriodTotals in feature-ui used dates.length (14).
            // So average = total / 14. Projected = total. This seems redundant unless daysWithData is dynamic.
            // Let's stick to the visible UI fields: Average Daily.

            setTotals({
                gratuity: totalGratuity,
                tip: totalTip,
                cash: totalCash,
                total: total,
                averageDaily: total / 14,
                projected: total // For now assume full period projection is just total if we don't track "days worked"
            });
        };

        calculateTotals();

    }, [start, currentWeekData]);


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

                <div className={styles.divider} />

                <div className={styles.row}><span>Average Daily</span><span>{fmt(totals.averageDaily || 0)}</span></div>
                <div className={styles.row}>
                    <span>Proj. Biweekly ({formatDate(start)} - {formatDate(end)})</span>
                    <span>{fmt(totals.projected || 0)}</span>
                </div>

                <div className={styles.totalRow}>
                    <span>Period Total</span>
                    <strong>{fmt(totals.total)}</strong>
                </div>
            </div>
        </div>
    );
}

export default BiweeklySummary;
