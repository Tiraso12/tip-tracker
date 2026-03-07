import React, { useState, useEffect } from "react";
import styles from "./Calendar.module.css";



function DayCard({ data, variant = 'week', readOnly = true }) {
    // Component is now purely read-only display. Admins use the dashboard to edit.

    const currentTotal = (
        Number(data.gratuity || 0) +
        Number(data.tip || 0) +
        Number(data.cash || 0)
    ).toFixed(2);

    const getTitle = () => {
        const d = new Date(data.date);
        if (variant === 'week') {
            const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
            return `${dayName} ${d.getMonth() + 1}/${d.getDate()}`;
        }
        return d.getDate();
    };

    return (
        <div className={styles.card}>
            <h1>{getTitle()}</h1>

            <div className={styles.row}>
                <span>Gratuity</span>
                <span className={styles.value}>${data.gratuity || "0"}</span>
            </div>

            <div className={styles.row}>
                <span>Tip</span>
                <span className={styles.value}>${data.tip || "0"}</span>
            </div>

            <div className={styles.row}>
                <span>Cash</span>
                <span className={styles.value}>${data.cash || "0"}</span>
            </div>

            <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalAmount}>${currentTotal}</span>
            </div>
        </div>
    );
}

// Wrapping in memo prevents re-renders when other days or global states change
// since the object reference isn't the only trigger anymore.
// We use a custom comparison function because 'data' contains a Date object and is recreated in MonthView.
export default React.memo(DayCard, (prevProps, nextProps) => {
    // Re-render ONLY if these specific display values change
    return (
        prevProps.data.dateKey === nextProps.data.dateKey &&
        prevProps.data.gratuity === nextProps.data.gratuity &&
        prevProps.data.tip === nextProps.data.tip &&
        prevProps.data.cash === nextProps.data.cash &&
        prevProps.variant === nextProps.variant
    );
});

