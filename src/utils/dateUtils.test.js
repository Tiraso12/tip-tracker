import test from "node:test";
import assert from "node:assert/strict";
import { getBiweeklyPeriod, getDateKeys, stepDateKey, toDateKey } from "./dateUtils.js";

test("formats local calendar dates as stable date keys", () => {
    assert.equal(toDateKey(new Date(2026, 5, 1, 23, 59)), "2026-06-01");
    assert.equal(toDateKey(new Date(2026, 0, 5, 0, 1)), "2026-01-05");
});

test("calculates biweekly period boundaries by calendar day", () => {
    const previousPeriod = getBiweeklyPeriod(new Date(2026, 4, 21));
    assert.equal(toDateKey(previousPeriod.start), "2026-05-08");
    assert.equal(toDateKey(previousPeriod.end), "2026-05-21");

    const nextPeriod = getBiweeklyPeriod(new Date(2026, 4, 22));
    assert.equal(toDateKey(nextPeriod.start), "2026-05-22");
    assert.equal(toDateKey(nextPeriod.end), "2026-06-04");
});

test("lists every day key in a range, inclusive of both ends", () => {
    const period = getBiweeklyPeriod(new Date(2026, 4, 29));
    const keys = getDateKeys(period.start, period.end);

    assert.equal(keys.length, 14);
    assert.equal(keys[0], "2026-05-22");
    assert.equal(keys.at(-1), "2026-06-04");

    assert.deepEqual(getDateKeys(new Date(2026, 5, 1), new Date(2026, 5, 1)), ["2026-06-01"]);
    assert.deepEqual(getDateKeys(null, new Date(2026, 5, 1)), []);
});

test("steps a day screen one calendar day, across month and DST boundaries", () => {
    assert.equal(stepDateKey("2026-06-01", "day", 1), "2026-06-02");
    assert.equal(stepDateKey("2026-06-01", "day", -1), "2026-05-31");
    // Spring forward (2026-03-08) and fall back (2026-11-01): a day step is a
    // calendar day, never 24 hours, so neither lands on the day it started on.
    assert.equal(stepDateKey("2026-03-07", "day", 1), "2026-03-08");
    assert.equal(stepDateKey("2026-03-08", "day", 1), "2026-03-09");
    assert.equal(stepDateKey("2026-11-01", "day", -1), "2026-10-31");
});

test("steps a week screen one Friday-start work week, never seven arbitrary days", () => {
    // Mon Jun 1 sits in the week starting Fri May 29: stepping re-anchors to that
    // Friday rather than moving to the following Monday.
    assert.equal(stepDateKey("2026-06-01", "week", -1), "2026-05-22");
    assert.equal(stepDateKey("2026-06-01", "week", 1), "2026-06-05");
    // Every further step stays on Fridays.
    assert.equal(stepDateKey(stepDateKey("2026-06-01", "week", 1), "week", 1), "2026-06-12");
    // From a Friday and from the Thursday that closes the same week, both land on
    // the same neighbouring weeks - they are one week apart, not six days.
    assert.equal(stepDateKey("2026-05-29", "week", 1), "2026-06-05");
    assert.equal(stepDateKey("2026-06-04", "week", 1), "2026-06-05");
    assert.equal(stepDateKey("2026-06-04", "week", -1), "2026-05-22");
});
