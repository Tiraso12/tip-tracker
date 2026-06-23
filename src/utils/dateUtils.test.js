import test from "node:test";
import assert from "node:assert/strict";
import { getBiweeklyPeriod, getEmployeeTipSubscriptionDateKeys, toDateKey } from "./dateUtils.js";

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

test("builds scoped employee tip subscription keys for week and month views", () => {
    const weekKeys = getEmployeeTipSubscriptionDateKeys(new Date(2026, 4, 29), "week");
    assert.equal(weekKeys.length, 14);
    assert.equal(weekKeys[0], "2026-05-22");
    assert.equal(weekKeys.at(-1), "2026-06-04");

    const monthKeys = getEmployeeTipSubscriptionDateKeys(new Date(2026, 4, 15), "month");
    assert.equal(monthKeys[0], "2026-04-26");
    assert.equal(monthKeys.at(-1), "2026-06-06");
    assert.equal(monthKeys.length, 42);
});
