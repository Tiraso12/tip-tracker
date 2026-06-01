import React, { useMemo } from "react";
import { isSameDay, toDateKey } from "../../utils/dateUtils";
import DayCard from "./DayCard";

const HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

function MonthView({ currentDate, allData }) {
    const days = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

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

    return (
        <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="grid grid-cols-7 border-b border-[var(--color-line)]">
                {HEADERS.map((h, i) => (
                    <div
                        key={`${h}-${i}`}
                        className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)] text-center"
                    >
                        {h}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7">
                {days.map((day, idx) => {
                    const dateKey = toDateKey(day);
                    const isToday = isSameDay(day, new Date());
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();

                    const dayData = {
                        date: day,
                        dateKey,
                        gratuity: allData?.[dateKey]?.gratuity || "",
                        tip: allData?.[dateKey]?.tip || "",
                        cash: allData?.[dateKey]?.cash || "",
                        role: allData?.[dateKey]?.role || "",
                        points: allData?.[dateKey]?.points || "",
                    };

                    const colIdx = idx % 7;
                    const rowIdx = Math.floor(idx / 7);
                    const totalRows = Math.ceil(days.length / 7);

                    return (
                        <div
                            key={dateKey}
                            className={
                                "min-h-[5rem] " +
                                (colIdx < 6 ? "border-r border-[var(--color-line)] " : "") +
                                (rowIdx < totalRows - 1 ? "border-b border-[var(--color-line)] " : "") +
                                (isCurrentMonth ? "" : "bg-[var(--color-surface-muted)]/40 opacity-60 ") +
                                (isToday ? "ring-2 ring-inset ring-[var(--color-accent)]/40 " : "")
                            }
                        >
                            <DayCard data={dayData} variant="month" />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default MonthView;
