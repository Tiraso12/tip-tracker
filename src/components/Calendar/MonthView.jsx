import React, { useMemo } from "react";
import { isSameDay, toDateKey } from "../../utils/dateUtils";
import { getNonCashDayTotal, fmtMoney } from "../../utils/employeeSummary";
import DayCard from "./DayCard";
import { roleShortLabel } from "../../utils/roleLabels";

const HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

function buildDayData(day, allData) {
    const dateKey = toDateKey(day);
    return {
        date: day,
        dateKey,
        gratuity: allData?.[dateKey]?.gratuity || "",
        tip: allData?.[dateKey]?.tip || "",
        cash: allData?.[dateKey]?.cash || "",
        role: allData?.[dateKey]?.role || "",
        points: allData?.[dateKey]?.points || "",
    };
}

const dayHasPayout = (data) =>
    Number(data.gratuity || 0) + Number(data.tip || 0) + Number(data.cash || 0) > 0;

// On phones the 7-column grid squeezes each day to ~51px and clips the payout, so the
// one number that matters becomes unreadable. Below 640px we swap the grid for a legible
// agenda list of the days actually worked - big date, role, tips (G+T) and cash - with the
// month totals pinned on top and a tap-through to that day's week view.
function AgendaList({ days, currentMonth, allData, onDaySelect }) {
    const { rows, tipsTotal, cashTotal } = useMemo(() => {
        const worked = days
            .filter((day) => day.getMonth() === currentMonth)
            .map((day) => ({ day, data: buildDayData(day, allData) }))
            .filter(({ data }) => dayHasPayout(data));

        const tips = worked.reduce((sum, { data }) => sum + getNonCashDayTotal(data), 0);
        const cash = worked.reduce((sum, { data }) => sum + Number(data.cash || 0), 0);

        return { rows: worked, tipsTotal: tips, cashTotal: cash };
    }, [days, currentMonth, allData]);

    if (rows.length === 0) {
        return (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-muted)]/40 px-4 py-10 text-center">
                <p className="text-sm text-[var(--color-ink-muted)]">
                    No payouts recorded this month.
                </p>
            </div>
        );
    }

    return (
        <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="flex items-stretch divide-x divide-[var(--color-line)] border-b border-[var(--color-line)] bg-[var(--color-surface-muted)]/40">
                <div className="flex-1 px-4 py-3">
                    <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Month tips (G+T)
                    </div>
                    <div className="mt-0.5 font-mono tabular-nums text-lg font-medium text-[var(--color-ink)]">
                        {fmtMoney(tipsTotal)}
                    </div>
                </div>
                <div className="flex-1 px-4 py-3">
                    <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Month cash
                    </div>
                    <div className="mt-0.5 font-mono tabular-nums text-lg font-medium text-[var(--color-ink)]">
                        {fmtMoney(cashTotal)}
                    </div>
                </div>
            </div>

            <ul className="divide-y divide-[var(--color-line)]">
                {rows.map(({ day, data }) => {
                    const isToday = isSameDay(day, new Date());
                    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day);
                    // Short label: this chip shares an agenda row with the day's money.
                    const roleLabel = data.role ? roleShortLabel(data.role) : null;
                    const tips = getNonCashDayTotal(data);
                    const cash = Number(data.cash || 0);

                    return (
                        <li key={data.dateKey}>
                            <button
                                type="button"
                                onClick={onDaySelect ? () => onDaySelect(day) : undefined}
                                className={
                                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150 " +
                                    (onDaySelect ? "cursor-pointer hover:bg-[var(--color-surface-muted)]/50 " : "cursor-default ") +
                                    (isToday ? "bg-[var(--color-accent-soft)]/40 " : "")
                                }
                                aria-label={onDaySelect ? `View ${weekday} ${day.getMonth() + 1}/${day.getDate()} in week view` : undefined}
                            >
                                <div className="shrink-0 w-11 text-center">
                                    <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                                        {weekday}
                                    </div>
                                    <div className="font-display text-xl font-medium tabular-nums leading-tight text-[var(--color-ink)]">
                                        {day.getDate()}
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1">
                                    {roleLabel ? (
                                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded-[var(--radius-xs)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                                            {roleLabel}
                                        </span>
                                    ) : null}
                                    <div className="mt-1 flex items-center gap-4 text-xs">
                                        <span className="flex items-center gap-1.5">
                                            <span className="text-[var(--color-ink-soft)]">Tips</span>
                                            <span className="font-mono tabular-nums text-[var(--color-ink)]">{fmtMoney(tips)}</span>
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="text-[var(--color-ink-soft)]">Cash</span>
                                            <span className="font-mono tabular-nums text-[var(--color-ink)]">{fmtMoney(cash)}</span>
                                        </span>
                                    </div>
                                </div>

                                {onDaySelect ? (
                                    <span className="shrink-0 text-[var(--color-ink-muted)] text-lg leading-none" aria-hidden="true">
                                        ›
                                    </span>
                                ) : null}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function MonthView({ currentDate, allData, onDaySelect }) {
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
        <>
            {/* Mobile: agenda list (legible, shows cash) */}
            <div className="sm:hidden">
                <AgendaList
                    days={days}
                    currentMonth={currentDate.getMonth()}
                    allData={allData}
                    onDaySelect={onDaySelect}
                />
            </div>

            {/* Tablet / desktop: the full month grid */}
            <section className="hidden sm:block bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden">
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

                        const dayData = buildDayData(day, allData);

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
        </>
    );
}

export default MonthView;
