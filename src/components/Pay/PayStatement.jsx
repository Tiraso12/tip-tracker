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
// cash always on its own line because it is handed over separately; the pay
// period and the date the advice lands. And hence no charts, no trend, no
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

function ShiftRow({ row }) {
    const date = new Date(`${row.dateKey}T12:00:00`);
    const dayLabel = `${new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)} ${date.getMonth() + 1}/${date.getDate()}`;

    if (!row.worked) {
        // A day off is a BLANK ROW, not a hidden one: seeing the empty Monday is
        // how an employee answers "did a day go missing?" for themselves.
        return (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[var(--color-surface-muted)]/40">
                <span className="text-sm text-[var(--color-ink-muted)]">{dayLabel}</span>
                <span className="text-xs text-[var(--color-ink-muted)]">
                    {row.notYet ? "Not worked yet" : "No shift"}
                </span>
            </div>
        );
    }

    return (
        <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-[var(--color-ink)]">{dayLabel}</span>
                    {row.role ? (
                        <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded-[var(--radius-xs)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                            {roleShortLabel(row.role)}
                            {row.points !== null ? ` · ${row.points} ${plural(row.points, "pt", "pts")}` : ""}
                        </span>
                    ) : null}
                </span>
                <strong className="shrink-0 font-mono tabular-nums text-sm text-[var(--color-ink)]">
                    {fmtMoney(row.total)}
                </strong>
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs font-mono tabular-nums">
                <span className="text-[var(--color-ink-soft)]">
                    CTP {fmtMoney(row.ctp)} · GRT {fmtMoney(row.grt)}
                </span>
                <span className="text-[var(--color-ink-muted)]">Cash {fmtMoney(row.cash)}</span>
            </div>
        </div>
    );
}

function MoneyRow({ label, value, strong = false, muted = false }) {
    return (
        <div className="flex items-baseline justify-between gap-3 px-5 py-2 sm:px-6 border-b border-[var(--color-line)] last:border-0">
            <span
                className={
                    "text-xs " +
                    (strong ? "font-medium text-[var(--color-ink)]" : muted ? "text-[var(--color-ink-muted)]" : "text-[var(--color-ink-soft)]")
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

    const period = useMemo(() => getBiweeklyPeriod(startDate || new Date()), [startDate]);
    const rangeKeys = useMemo(() => getDateKeys(startDate, endDate), [startDate, endDate]);
    const periodKeys = useMemo(() => getDateKeys(period.start, period.end), [period]);
    const subscriptionKeys = useMemo(
        () => getPayStatementSubscriptionKeys(startDate, endDate),
        [startDate, endDate]
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

    const todayKey = toDateKey(new Date());
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
            <Card className="!p-0 overflow-hidden">
                <div className="px-5 py-5 sm:px-6">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        {eyebrow}
                    </span>
                    <p className="mt-1 font-mono tabular-nums text-xs text-[var(--color-ink-soft)]">
                        {heading}
                    </p>
                    <strong className="mt-3 block font-display text-[2rem] leading-none font-medium tracking-tight tabular-nums text-[var(--color-ink)]">
                        {fmtMoney(rangeTotals.total)}
                    </strong>
                    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                        <span>CTP {fmtMoney(rangeTotals.ctp)}</span>
                        <span>GRT {fmtMoney(rangeTotals.grt)}</span>
                        <span className="text-[var(--color-ink-muted)]">
                            {rangeTotals.shifts} {plural(rangeTotals.shifts, "shift", "shifts")}
                        </span>
                    </div>
                </div>

                {/* Cash on its own line, always, and said in words as well as
                    position - it is handed over separately and is never part of
                    a total. */}
                <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6 border-t border-[var(--color-line)] bg-[var(--color-surface-muted)]/50">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--color-ink-soft)]">Cash</p>
                        <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
                            Paid separately in cash. Not part of the total above.
                        </p>
                    </div>
                    <span className="shrink-0 font-mono tabular-nums text-sm text-[var(--color-ink-soft)]">
                        {fmtMoney(rangeTotals.cash)}
                    </span>
                </div>
            </Card>

            <Card className="!p-0 overflow-hidden">
                <div className="px-4 py-2 border-b border-[var(--color-line)] bg-[var(--color-surface-muted)]/65 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                    Shifts
                </div>
                <div className="divide-y divide-[var(--color-line)]">
                    {rangeRows.map((row) => (
                        <ShiftRow key={row.dateKey} row={row} />
                    ))}
                </div>
            </Card>

            <Card className="!p-0 overflow-hidden">
                <div className="px-5 py-4 sm:px-6 border-b border-[var(--color-line)]">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Pay period
                    </span>
                    <p className="mt-1 font-mono tabular-nums text-xs text-[var(--color-ink-soft)]">
                        {formatMonthDayRange(period.start, period.end)} · 2 weeks · {periodTotals.shifts}{" "}
                        {plural(periodTotals.shifts, "shift", "shifts")}
                    </p>
                </div>
                <MoneyRow label="CTP" value={fmtMoney(periodTotals.ctp)} />
                <MoneyRow label="GRT" value={fmtMoney(periodTotals.grt)} />
                <MoneyRow label="Total (CTP+GRT)" value={fmtMoney(periodTotals.total)} strong />
                <MoneyRow label="Cash · paid separately" value={fmtMoney(periodTotals.cash)} muted />
                <MoneyRow label="Advice" value={formatMonthDay(adviceDate)} />
            </Card>

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
