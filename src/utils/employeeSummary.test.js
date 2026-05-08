import test from "node:test";
import assert from "node:assert/strict";
import { buildEmployeePeriodSummary, getDateKeys, getDayTotal } from "./employeeSummary.js";

test("builds totals and shift stats for an employee period", () => {
    const keys = ["2026-05-01", "2026-05-02", "2026-05-03"];
    const summary = buildEmployeePeriodSummary({
        "2026-05-01": { gratuity: 50, tip: 75, cash: 25, role: "server" },
        "2026-05-02": { gratuity: "", tip: "", cash: "", role: "server" },
        "2026-05-03": { gratuity: 100, tip: 150, cash: 50, role: "captain" },
    }, keys);

    assert.equal(summary.workedDays, 2);
    assert.equal(summary.totals.gratuity, 150);
    assert.equal(summary.totals.tip, 225);
    assert.equal(summary.totals.cash, 75);
    assert.equal(summary.totals.total, 450);
    assert.equal(summary.averageShift, 225);
    assert.equal(summary.bestDay.dateKey, "2026-05-03");
    assert.deepEqual(summary.roleCounts, { server: 1, captain: 1 });
});

test("treats missing or empty day data as zero", () => {
    assert.equal(getDayTotal({ gratuity: "", tip: null, cash: undefined }), 0);

    const summary = buildEmployeePeriodSummary({}, ["2026-05-01"]);
    assert.equal(summary.workedDays, 0);
    assert.equal(summary.totals.total, 0);
    assert.equal(summary.bestDay, null);
});

test("generates inclusive date keys", () => {
    const keys = getDateKeys(new Date("2026-05-01T00:00:00"), new Date("2026-05-03T00:00:00"));
    assert.deepEqual(keys, ["2026-05-01", "2026-05-02", "2026-05-03"]);
});
