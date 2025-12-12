import React, { useMemo, useEffect, useState } from "react";
import styles from "./BiweeklySummary.module.css";
import { getBiweeklyPeriod, formatDate } from "../../utils/dateUtils";
import DataService from "../../services/dataService";

function BiweeklySummary({ currentWeekData, currentWeekStart, viewMode, currentDate, allData }) {
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
        if (viewMode === 'month' && currentDate) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            return {
                start: new Date(year, month, 1),
                end: new Date(year, month + 1, 0)
            };
        }
        if (!currentWeekStart) return { start: new Date(), end: new Date() };
        return getBiweeklyPeriod(currentWeekStart);
    }, [currentWeekStart, viewMode, currentDate]);

    const [totals, setTotals] = useState({ gratuity: 0, tip: 0, cash: 0, total: 0 });

    useEffect(() => {
        if (!start) return;

        const calculateTotals = async () => {
            // Determine number of days in range
            const dayCount = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

            const dates = [];
            for (let i = 0; i < dayCount; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                dates.push(d.toISOString().split('T')[0]);
            }

            // Use allData if available (passed from App), otherwise fallback to service
            // In Month view, App passes allData. In Week view, we might rely on service if old code did.
            // But App now passes allData always.

            let totalGratuity = 0;
            let totalTip = 0;
            let totalCash = 0;

            dates.forEach(dateKey => {
                // Priority: currentWeekData (if editing) -> allData (if loaded) -> service (fallback)
                // Actually allData in App is the source of truth for Month View.
                // currentWeekData is specifically for the active week being edited.

                const liveDay = currentWeekData?.find(d => d.dateKey === dateKey); // Only relevant if this day is in current week
                const contextData = allData?.[dateKey];

                const source = liveDay || contextData || { gratuity: 0, tip: 0, cash: 0 };

                totalGratuity += Number(source.gratuity) || 0;
                totalTip += Number(source.tip) || 0;
                totalCash += Number(source.cash) || 0;
            });

            const total = totalGratuity + totalTip + totalCash;

            setTotals({
                gratuity: totalGratuity,
                tip: totalTip,
                cash: totalCash,
                total: total,
                averageDaily: total / dayCount, // Average over the full period
                projected: total // Projection logic is vague, sticking to actuals for now
            });
        };

        calculateTotals();

    }, [start, end, currentWeekData, allData]);


    const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    return (
        <div className={styles.summary}>
            <div className={styles.header}>
                <h2 className={styles.title}>{viewMode === 'month' ? 'MONTHLY SUMMARY' : 'FINANCIAL SUMMARY'}</h2>
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
                    <span>{viewMode === 'month' ? 'Proj. Month' : 'Proj. Biweekly'} ({formatDate(start)} - {formatDate(end)})</span>
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
