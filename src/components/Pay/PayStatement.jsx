import React, { useEffect, useMemo, useState } from "react";
import DataService from "../../services/dataService";
import { formatMonthDay, formatMonthDayRange, getBiweeklyPeriod, getDateKeys, toDateKey } from "../../utils/dateUtils";
import {
    PAY_RECORDS_START_LABEL,
    buildPayStatementRows,
    fmtMoney,
    getPayStatementSubscriptionKeys,
    sumPayStatementRows,
} from "../../utils/payStatement";
import { roleShortLabel } from "../../utils/roleLabels";
import { Card } from "../ui";

// ONE pay statement, for one person over one range of days. Mine and a
// colleague's are the same component: the roster's person view hands it a
// different person and the same props, so the two can never drift into two
// statements that disagree about a number or a word.
//
// What this component deliberately does NOT own:
//   - who may read it. Two different permissions reach here (your own pay, and
//     canReadColleaguePay) and firestore.rules is what enforces both. A
//     component that re-decided that would be a third answer.
//   - how the viewer arrived, or where they go next.
//   - the identity header. Mine says which WEEK; a colleague's has to say WHO.
//     The caller passes both lines, this draws them.
// It writes nothing, ever. Correcting a night stays in the day flow, where the
// audit trail is.
//
// It is a PAY STUB and not a dashboard - the guard the shape was held to is
// "would an employee call this their pay stub". Hence: every day in the range
// listed, worked or not; CTP, GRT and Total in the payout table's own words;
// cash on its own line for the WEEK, because it is handed over weekly and
// separately and never belongs to a total; the pay period and the date the
// advice lands. And hence no charts, no trend, no
// average, no best day, no pool maths, and no comparison to anyone else.

function InfoIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}

const plural = (count, one, many) => (count === 1 ? one : many);

function getPreviousPayPeriod(period) {
    const previousDay = new Date(period.start);
    previousDay.setDate(previousDay.getDate() - 1);
    return getBiweeklyPeriod(previousDay);
}

function DateBlock({ date, active }) {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
    return (
        <span
            className={
                "flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] " +
                (active
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]"
                    : "bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]")
            }
            aria-hidden="true"
        >
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em]">{weekday}</span>
            <span className="font-mono text-base font-semibold leading-none tabular-nums">{date.getDate()}</span>
        </span>
    );
}

function ShiftRow({ row }) {
    const date = new Date(`${row.dateKey}T12:00:00`);

    if (!row.worked) {
        // A day off is a BLANK ROW, not a hidden one: seeing the empty Monday is
        // how an employee answers "did a day go missing?" for themselves.
        return (
            <div className="flex items-center gap-3 px-3.5 py-2">
                <DateBlock date={date} active={false} />
                <span className="text-xs text-[var(--color-ink-muted)]">
                    {row.notYet ? "Not worked yet" : "No shift"}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 px-3.5 py-3">
            <DateBlock date={date} active />
            <div className="min-w-0 flex-1">
                <div className="min-w-0">
                    {row.role ? (
                        <span className="inline-flex max-w-full items-center rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
                            {roleShortLabel(row.role)}
                            {row.points !== null ? ` · ${row.points} ${plural(row.points, "pt", "pts")}` : ""}
                        </span>
                    ) : null}
                </div>
                <p className="mt-1 font-mono text-[11.5px] tabular-nums text-[var(--color-ink-soft)]">
                    CTP {fmtMoney(row.ctp)} · GRT {fmtMoney(row.grt)}
                </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
                <strong className="font-mono text-base font-semibold tabular-nums text-[var(--color-ink)]">
                    {fmtMoney(row.total)}
                </strong>
                <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)]">
                    Cash {fmtMoney(row.cash)}
                </span>
            </div>
        </div>
    );
}

function MoneyRow({ label, value, strong = false }) {
    return (
        <div className="flex items-baseline justify-between gap-3 px-5 py-2 sm:px-6 border-b border-[var(--color-line)] last:border-0">
            <span
                className={
                    "text-xs " +
                    (strong ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]")
                }
            >
                {label}
            </span>
            <span
                className={
                    "font-mono tabular-nums " +
                    (strong ? "text-sm font-medium text-[var(--color-ink)]" : "text-sm text-[var(--color-ink-soft)]")
                }
            >
                {value}
            </span>
        </div>
    );
}

function PayStatement({ person, startDate, endDate, eyebrow, heading, voice = "own" }) {
    const personUid = person?.uid || null;
    const [allData, setAllData] = useState({});

    const selectedPeriod = useMemo(() => getBiweeklyPeriod(startDate || new Date()), [startDate]);
    const todayKey = toDateKey(new Date());
    const period = useMemo(() => {
        const selectedPeriodEndKey = toDateKey(selectedPeriod.end);
        return selectedPeriodEndKey >= todayKey ? getPreviousPayPeriod(selectedPeriod) : selectedPeriod;
    }, [selectedPeriod, todayKey]);
    const rangeKeys = useMemo(() => getDateKeys(startDate, endDate), [startDate, endDate]);
    const periodKeys = useMemo(() => getDateKeys(period.start, period.end), [period]);
    const subscriptionKeys = useMemo(
        () => Array.from(new Set([
            ...getPayStatementSubscriptionKeys(startDate, endDate),
            ...periodKeys,
        ])).sort(),
        [startDate, endDate, periodKeys]
    );

    // Whose money is on screen has to change the instant the person does -
    // holding the previous person's days for one frame would show someone the
    // wrong pay, however briefly.
    useEffect(() => {
        setAllData({});
    }, [personUid]);

    // One document per date, never a collection query: firestore.rules lets a
    // person get their own entry by uid, and a captain get anyone's, but lists
    // are captain-only. The bounded window is what keeps this a handful of
    // reads instead of a whole history.
    useEffect(() => {
        if (!personUid) return undefined;
        return DataService.subscribeToDatesForUser(
            personUid,
            subscriptionKeys,
            (dateKey, data) => setAllData((prev) => ({ ...prev, [dateKey]: data })),
            () => setAllData({})
        );
    }, [personUid, subscriptionKeys]);

    const rangeRows = useMemo(
        () => buildPayStatementRows(allData, rangeKeys, todayKey),
        [allData, rangeKeys, todayKey]
    );
    const rangeTotals = useMemo(() => sumPayStatementRows(rangeRows), [rangeRows]);
    const periodTotals = useMemo(
        () => sumPayStatementRows(buildPayStatementRows(allData, periodKeys, todayKey)),
        [allData, periodKeys, todayKey]
    );

    // The advice lands a week after the period closes.
    const adviceDate = useMemo(() => {
        const advice = new Date(period.end);
        advice.setDate(period.end.getDate() + 7);
        return advice;
    }, [period]);

    return (
        <div className="space-y-4" data-testid="pay-statement">
            <header className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                    {eyebrow}
                </span>
                <h1 className="m-0 font-display text-[2rem] font-normal leading-[1.1] text-[var(--color-ink)] max-[560px]:text-[31px]">
                    {heading}
                </h1>
            </header>

            <section className="flex items-end justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bar-bg)] px-5 py-[18px] text-[var(--color-bar-ink)] max-[560px]:px-4" aria-label="Weekly take-home">
                <div className="min-w-0">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(246,250,247,0.6)]">
                        This week
                    </span>
                    <strong className="mt-1 block font-display text-[2.5rem] font-normal leading-none text-[var(--color-bar-ink-soft)] max-[560px]:text-[38px]">
                        {fmtMoney(rangeTotals.total)}
                    </strong>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[11px] text-[var(--color-bar-ink-soft)]">Cash</p>
                    <span className="mt-1 block font-mono text-[15px] tabular-nums text-[#3ecf8e]">
                        {fmtMoney(rangeTotals.cash)}
                    </span>
                </div>
            </section>

            <div className="space-y-2" aria-label="Daily pay">
                {rangeRows.map((row) => {
                    const cardClass = row.worked
                        ? "border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
                        : "border-dashed border-[var(--color-line)] bg-transparent";
                    return (
                        <div key={row.dateKey} className={"overflow-hidden rounded-[var(--radius-md)] border " + cardClass}>
                            <ShiftRow row={row} />
                        </div>
                    );
                })}
            </div>

            <Card className="!p-0 overflow-hidden" aria-label="Paycheck totals">
                <MoneyRow label="CTP (paycheck)" value={fmtMoney(periodTotals.ctp)} />
                <MoneyRow label="GRT (paycheck)" value={fmtMoney(periodTotals.grt)} />
                <MoneyRow label="Cash (handed weekly)" value={fmtMoney(rangeTotals.cash)} />
                <MoneyRow label="Pay period total" value={fmtMoney(periodTotals.total)} strong />
            </Card>

            <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
                <InfoIcon />
                <span>
                    Pay period {formatMonthDayRange(period.start, period.end)} · lands on your {formatMonthDay(adviceDate)} paycheck.
                </span>
            </p>

            <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
                <InfoIcon />
                <span>
                    {voice === "own" ? "Your pay records begin " : "Pay records begin "}
                    <strong className="font-medium text-[var(--color-ink-soft)]">{PAY_RECORDS_START_LABEL}</strong>
                    {" - the day daily recording started. Earlier weeks are not shown."}
                </span>
            </p>
        </div>
    );
}

export default PayStatement;
