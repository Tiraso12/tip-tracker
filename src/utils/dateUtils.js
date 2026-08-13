/**
 * Returns an array of 7 Date objects representing the current work week.
 * The work week starts on Friday and ends on Thursday.
 */
export function getCurrentWeek(baseDate = new Date()) {
    const start = new Date(baseDate);
    const day = start.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat

    // Calculate difference from the last Friday (5)
    // If today is Friday (5), diff is 0.
    // If today is Thursday (4), diff is 6 (went back 6 days to last Fri).
    // Formula: (day - 5 + 7) % 7
    const diff = (day - 5 + 7) % 7;

    start.setDate(start.getDate() - diff); // Set to the most recent Friday
    start.setHours(0, 0, 0, 0); // Normalize time

    const week = [];
    for (let i = 0; i < 7; i++) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        week.push(current);
    }
    return week;
}

/**
 * Formats a Date as a local calendar key, "YYYY-MM-DD".
 * Avoid using toISOString() for day keys because it converts to UTC first.
 */
export function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Formats a date as "MM/DD/YY"
 */
export function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
    }).format(date);
}

/**
 * Formats a date as "May 22".
 */
export function formatMonthDay(date) {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
    }).format(date);
}

/**
 * Formats a date range as "May 22 - Jun 4".
 */
export function formatMonthDayRange(start, end) {
    if (!start || !end) return "";
    return `${formatMonthDay(start)} - ${formatMonthDay(end)}`;
}

/**
 * Formats a date as "Day" (e.g., "Friday")
 */
export function formatDayName(date) {
    return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
}

/**
 * Checks if two dates are the same day
 */
export function isSameDay(d1, d2) {
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
}

/**
 * Returns the start and end dates of the biweekly period for a given date.
 * Anchor date is Nov 21, 2025.
 */
export function getBiweeklyPeriod(date) {
    const anchor = new Date(2025, 10, 21);
    const current = new Date(date);
    current.setHours(0, 0, 0, 0);

    // Count calendar days instead of elapsed milliseconds so daylight saving
    // offsets cannot push boundary dates into the previous pay period.
    const oneDay = 24 * 60 * 60 * 1000;
    const anchorUtc = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const currentUtc = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
    const diffDays = Math.floor((currentUtc - anchorUtc) / oneDay);

    // Each period is 14 days
    const periodsPassed = Math.floor(diffDays / 14);

    const start = new Date(anchor);
    start.setDate(anchor.getDate() + (periodsPassed * 14));

    const end = new Date(start);
    end.setDate(start.getDate() + 13); // 13 days after start is the end of the 2-week block

    return { start, end };
}

/**
 * Every day key from start to end inclusive, in order.
 */
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
