import { getBiweeklyPeriod, getDateKeys, toDateKey } from "./dateUtils.js";

// The money maths behind a pay statement - one person, one range of days.
//
// This is the employee side of the same numbers the payout table shows, so it
// speaks the same words: CTP (charged tip), GRT (gratuity), Total = CTP + GRT,
// and cash ALWAYS on its own line because it is handed over separately and is
// never part of a total (see the money rule in AGENTS.md).

const toNumber = (value) => Number(value) || 0;

export const fmtMoney = (value) =>
    toNumber(value).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
    });

// The day daily recording started. A NAMED CONSTANT and never a relative
// window: "the last 90 days" would quietly start hiding real pay as time
// passes, and would tell a different story to each person reading it. Nothing
// before this date exists to show - the data is not hidden, it was never
// recorded - which is what the boundary line on the statement says out loud.
export const PAY_RECORDS_START_KEY = "2026-06-23";
export const PAY_RECORDS_START_LABEL = "Jun 23, 2026";

/** Total paid to a person for one day. Cash is deliberately not in it. */
export function getNonCashDayTotal(day = {}) {
    return toNumber(day.gratuity) + toNumber(day.tip);
}

/** Everything a person was handed for one day, cash included. Worked-or-not. */
export function getDayTotal(day = {}) {
    return getNonCashDayTotal(day) + toNumber(day.cash);
}

/**
 * One row per DAY in the range, worked or not. A day off stays in the list as a
 * blank row on purpose: a visible empty Monday answers "did a day go missing?"
 * without anyone having to ask, which hiding it cannot do.
 *
 * @param {Object} allData map of dateKey -> employee payout data
 * @param {string[]} dateKeys the days to render, in order
 * @param {string} todayKey today, so a night that has not been recorded yet
 *        reads differently from one that was simply not worked. Today counts as
 *        not-yet: the shift it might hold is settled after service, so "No
 *        shift" on the day itself would be answering a question nobody has
 *        asked yet.
 */
export function buildPayStatementRows(allData = {}, dateKeys = [], todayKey = toDateKey(new Date())) {
    return dateKeys.map((dateKey) => {
        const entry = allData[dateKey] || {};
        const ctp = toNumber(entry.tip);
        const grt = toNumber(entry.gratuity);
        const cash = toNumber(entry.cash);
        const hasPoints = entry.points !== undefined && entry.points !== null && entry.points !== "";

        return {
            dateKey,
            ctp,
            grt,
            cash,
            total: getNonCashDayTotal(entry),
            role: entry.role || "",
            points: hasPoints ? Number(entry.points) : null,
            worked: ctp + grt + cash > 0,
            notYet: dateKey >= todayKey,
        };
    });
}

/** Adds up statement rows. `shifts` counts days worked, not days listed. */
export function sumPayStatementRows(rows = []) {
    return rows.reduce(
        (acc, row) => {
            if (!row.worked) return acc;
            acc.ctp += row.ctp;
            acc.grt += row.grt;
            acc.cash += row.cash;
            acc.total += row.total;
            acc.shifts += 1;
            return acc;
        },
        { ctp: 0, grt: 0, cash: 0, total: 0, shifts: 0 }
    );
}

/**
 * The exact set of ledger documents a statement needs: the days it lists, plus
 * the pay period those days sit in, and nothing else. A statement reads one
 * document per date and never lists a collection, so this window IS the read
 * cost - keep it bounded.
 */
export function getPayStatementSubscriptionKeys(startDate, endDate) {
    if (!startDate || !endDate) return [];
    const period = getBiweeklyPeriod(startDate);
    const keys = new Set([
        ...getDateKeys(startDate, endDate),
        ...getDateKeys(period.start, period.end),
    ]);
    return Array.from(keys).sort();
}
