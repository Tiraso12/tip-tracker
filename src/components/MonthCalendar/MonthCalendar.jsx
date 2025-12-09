import React from 'react';
import styles from './MonthCalendar.module.css';
import summaryStyles from '../Summary/Summary.module.css'; // Reuse Summary styles
import { getCalendarMonth, isSameDay, formatDate } from '../../utils/dateUtils';


const MonthCalendar = ({ monthDate, onMonthChange, monthData = {} }) => {
    const dates = getCalendarMonth(monthDate);
    const today = new Date();

    // Helper for month title
    const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthDate);

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const handlePrevMonth = () => {
        const newDate = new Date(monthDate);
        newDate.setMonth(newDate.getMonth() - 1);
        onMonthChange(newDate);
    };

    const handleNextMonth = () => {
        const newDate = new Date(monthDate);
        newDate.setMonth(newDate.getMonth() + 1);
        onMonthChange(newDate);
    };

    // Calculate totals for the current month view
    const currentMonthDates = dates.filter(d => d.getMonth() === monthDate.getMonth());

    // Get start and end date for the summary range display
    const startDate = currentMonthDates.length > 0 ? currentMonthDates[0] : null;
    const endDate = currentMonthDates.length > 0 ? currentMonthDates[currentMonthDates.length - 1] : null;

    let monthGratuity = 0;
    let monthTip = 0;
    let monthCash = 0;

    currentMonthDates.forEach(date => {
        const dateKey = date.toISOString().split('T')[0];
        const data = monthData[dateKey];
        if (data) {
            monthGratuity += parseFloat(data.gratuity) || 0;
            monthTip += parseFloat(data.tip) || 0;
            monthCash += parseFloat(data.cash) || 0;
        }
    });

    const monthTotal = monthGratuity + monthTip + monthCash;
    const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    return (
        <div className={styles.calendarContainer}>
            <header className={styles.header}>
                <button className={styles.navButton} onClick={handlePrevMonth}>&lt;</button>
                <h2 className={styles.monthTitle}>{monthTitle}</h2>
                <button className={styles.navButton} onClick={handleNextMonth}>&gt;</button>
            </header>

            <div className={styles.grid}>
                {daysOfWeek.map(day => (
                    <div key={day} className={styles.dayHeader}>{day}</div>
                ))}

                {dates.map((date, i) => {
                    const isCurrentMonth = date.getMonth() === monthDate.getMonth();
                    const isToday = isSameDay(date, today);
                    const dateKey = date.toISOString().split('T')[0];
                    const data = monthData[dateKey] || {};

                    const tip = parseFloat(data.tip) || 0;
                    const cash = parseFloat(data.cash) || 0;
                    const gratuity = parseFloat(data.gratuity) || 0;
                    const total = tip + cash + gratuity;

                    const hasData = tip > 0 || cash > 0 || gratuity > 0;

                    return (
                        <div
                            key={dateKey}
                            className={`
                ${styles.cell} 
                ${!isCurrentMonth ? styles.otherMonth : ''}
                ${isToday ? styles.today : ''}
              `}
                        >
                            <div className={styles.dateHeader}>
                                <span className={styles.dateNumber}>{date.getDate()}</span>
                            </div>

                            <div className={styles.row}>
                                <span className={styles.label}>Grat</span>
                                <span className={styles.value}>{data.gratuity || "—"}</span>
                            </div>
                            <div className={styles.row}>
                                <span className={styles.label}>Tip</span>
                                <span className={styles.value}>{data.tip || "—"}</span>
                            </div>
                            <div className={styles.row}>
                                <span className={styles.label}>Cash</span>
                                <span className={styles.value}>{data.cash || "—"}</span>
                            </div>

                            <div className={styles.row}>
                                <span className={styles.label}><strong>Total</strong></span>
                                <span className={styles.totalValue}>${total.toFixed(2)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className={summaryStyles.summary}>
                <h2 className={summaryStyles.title}>MONTH SUMMARY</h2>
                {startDate && endDate && (
                    <div className={summaryStyles.subtitle}>
                        {formatDate(startDate)} - {formatDate(endDate)}
                    </div>
                )}
                <div className={summaryStyles.row}><span>Total gratuity</span><span>{fmt(monthGratuity)}</span></div>
                <div className={summaryStyles.row}><span>Total tip</span><span>{fmt(monthTip)}</span></div>
                <div className={summaryStyles.row}><span>Total cash</span><span>{fmt(monthCash)}</span></div>
                <div className={summaryStyles.row}><span>total this month</span><strong>{fmt(monthTotal)}</strong></div>
            </div>
        </div>
    );
};

export default MonthCalendar;
