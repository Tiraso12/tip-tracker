import { toDateKey } from "./dateUtils.js";

const toNumber = (value) => Number(value) || 0;

export const fmtMoney = (value) =>
    toNumber(value).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
    });

export function getDateKeys(start, end) {
    if (!start || !end) return [];

    const keys = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    const finalDate = new Date(end);
    finalDate.setHours(0, 0, 0, 0);

    while (cursor <= finalDate) {
        keys.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return keys;
}

export function getDayTotal(day = {}) {
    return toNumber(day.gratuity) + toNumber(day.tip) + toNumber(day.cash);
}

export function getNonCashDayTotal(day = {}) {
    return toNumber(day.gratuity) + toNumber(day.tip);
}

export function buildEmployeePeriodSummary(allData = {}, dateKeys = []) {
    const entries = dateKeys.map((dateKey) => ({
        dateKey,
        ...(allData[dateKey] || {}),
    }));

    const workedEntries = entries.filter((entry) => getDayTotal(entry) > 0);
    const totals = workedEntries.reduce(
        (acc, entry) => {
            acc.gratuity += toNumber(entry.gratuity);
            acc.tip += toNumber(entry.tip);
            acc.cash += toNumber(entry.cash);
            acc.total += getDayTotal(entry);
            return acc;
        },
        { gratuity: 0, tip: 0, cash: 0, total: 0 }
    );

    const bestDay = workedEntries.reduce((best, entry) => {
        if (!best || getDayTotal(entry) > getDayTotal(best)) return entry;
        return best;
    }, null);

    const roleCounts = workedEntries.reduce((acc, entry) => {
        if (entry.role) acc[entry.role] = (acc[entry.role] || 0) + 1;
        return acc;
    }, {});

    return {
        entries,
        workedEntries,
        totals,
        workedDays: workedEntries.length,
        averageShift: workedEntries.length > 0 ? totals.total / workedEntries.length : 0,
        bestDay,
        roleCounts,
    };
}
