import React, { useMemo } from "react";
import styles from "./MonthView.module.css";
import { isSameDay } from "../../utils/dateUtils";
import DayCard from "./DayCard";

function MonthView({ currentDate, allData, onUpdate }) {
    const days = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // First day of this month
        const firstDayOfMonth = new Date(year, month, 1);
        // Last day of this month
        const lastDayOfMonth = new Date(year, month + 1, 0);

        // Start from the Sunday (or whatever start of week) before the 1st
        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(startDate.getDate() - startDate.getDay());

        const endDate = new Date(lastDayOfMonth);
        if (endDate.getDay() !== 6) {
            endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
        }

        const d = new Date(startDate);
        const calendarDays = [];

        while (d <= endDate) {
            calendarDays.push(new Date(d));
            d.setDate(d.getDate() + 1);
        }
        return calendarDays;

    }, [currentDate]);

    const headers = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
        <div className={styles.container}>
            <div className={styles.grid}>
                {headers.map(h => <div key={h} className={styles.dayHeader}>{h}</div>)}

                {days.map(day => {
                    const dateKey = day.toISOString().split('T')[0];
                    const isToday = isSameDay(day, new Date());
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();

                    // Construct data object expected by DayCard
                    const dayData = {
                        date: day,
                        dateKey: dateKey,
                        gratuity: allData?.[dateKey]?.gratuity || "",
                        tip: allData?.[dateKey]?.tip || "",
                        cash: allData?.[dateKey]?.cash || ""
                    };

                    return (
                        <div
                            key={dateKey}
                            className={`
                ${styles.dayCellWrapper} 
                ${!isCurrentMonth ? styles.otherMonth : ''}
                ${isToday ? styles.todayWrapper : ''}
              `}
                        >
                            <DayCard
                                data={dayData}
                                onUpdate={onUpdate}
                                variant="month"
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default MonthView;
