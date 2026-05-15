import React from "react";
import styles from "./Calendar.module.css";

const roleLabels = {
    captain: "Captain",
    server: "Server",
    back: "Back Server",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

const fmt = (value) => (Number(value) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
});

function DayCard({ data, variant = 'week' }) {
    // Component is now purely read-only display. Admins use the dashboard to edit.

    const currentTotal =
        Number(data.gratuity || 0) +
        Number(data.tip || 0) +
        Number(data.cash || 0);
    const hasPayout = currentTotal > 0;
    const roleLabel = data.role ? roleLabels[data.role] || data.role : null;

    const getTitle = () => {
        const d = new Date(data.date);
        if (variant === 'week') {
            const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
            return `${dayName} ${d.getMonth() + 1}/${d.getDate()}`;
        }
        return d.getDate();
    };

    return (
        <div className={`${styles.card} ${!hasPayout ? styles.emptyCard : ""}`}>
            <div className={styles.cardHeader}>
                <h1>{getTitle()}</h1>
                {roleLabel && <span className={styles.roleBadge}>{roleLabel}</span>}
            </div>

            <div className={styles.row}>
                <span>Gratuity</span>
                <span className={styles.value}>{fmt(data.gratuity)}</span>
            </div>

            <div className={styles.row}>
                <span>Tip</span>
                <span className={styles.value}>{fmt(data.tip)}</span>
            </div>

            <div className={styles.row}>
                <span>Cash</span>
                <span className={styles.value}>{fmt(data.cash)}</span>
            </div>

            <div className={styles.totalRow}>
                <span>Total</span>
                <strong>{fmt(currentTotal)}</strong>
            </div>

            {data.points !== undefined && data.points !== null && data.points !== "" && (
                <div className={styles.pointsRow}>
                    <span>{Number(data.points)} points</span>
                </div>
            )}
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
        prevProps.data.role === nextProps.data.role &&
        prevProps.data.points === nextProps.data.points &&
        prevProps.variant === nextProps.variant
    );
});
