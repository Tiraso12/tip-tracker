import test from "node:test";
import assert from "node:assert/strict";
import { getBiweeklyPeriod, toDateKey } from "./dateUtils.js";

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
