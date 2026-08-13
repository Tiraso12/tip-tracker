import test from "node:test";
import assert from "node:assert/strict";
import {
    PAY_RECORDS_START_KEY,
    buildPayStatementRows,
    getNonCashDayTotal,
    getPayStatementSubscriptionKeys,
    sumPayStatementRows,
} from "./payStatement.js";

const WEEK = ["2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"];

const DATA = {
    "2026-08-07": { tip: 210.4, gratuity: 65.6, cash: 44.8, role: "captain", points: 4 },
    "2026-08-08": { tip: 263.2, gratuity: 83.2, cash: 52.8, role: "captain", points: 4 },
    // 08-09 is a day off
    "2026-08-10": { tip: 157.8, gratuity: 48, cash: 30.4, role: "server", points: 4 },
};

test("a day's total is CTP plus GRT, and never the cash", () => {
    // The money rule, from the employee's side of it: cash is handed over
    // separately and folding it into a total would overstate the payout and
    // break agreement with the payout table.
    assert.equal(getNonCashDayTotal(DATA["2026-08-07"]), 276);
    assert.equal(getNonCashDayTotal({}), 0);
});

test("every day in the range gets a row, worked or not", () => {
    const rows = buildPayStatementRows(DATA, WEEK, "2026-08-12");

    // A day off is a blank ROW, not a missing one: an employee has to be able
    // to see that Sunday was not worked rather than wonder if it went missing.
    assert.equal(rows.length, 7);
    assert.deepEqual(rows.map((row) => row.worked), [true, true, false, true, false, false, false]);
});

test("a row carries the payout table's own numbers and words", () => {
    const [friday] = buildPayStatementRows(DATA, WEEK, "2026-08-12");

    assert.equal(friday.ctp, 210.4);
    assert.equal(friday.grt, 65.6);
    assert.equal(friday.cash, 44.8);
    assert.equal(friday.total, 276);
    assert.equal(friday.role, "captain");
    assert.equal(friday.points, 4);
});

test("today and later read as not-yet, earlier blanks read as no shift", () => {
    const rows = buildPayStatementRows(DATA, WEEK, "2026-08-12");
    const byKey = Object.fromEntries(rows.map((row) => [row.dateKey, row]));

    // A night is settled after service, so "No shift" on the day itself would
    // be answering a question nobody has asked yet.
    assert.equal(byKey["2026-08-09"].notYet, false);
    assert.equal(byKey["2026-08-12"].notYet, true);
    assert.equal(byKey["2026-08-13"].notYet, true);
});

test("totals count worked days only and keep cash apart", () => {
    const totals = sumPayStatementRows(buildPayStatementRows(DATA, WEEK, "2026-08-12"));

    assert.equal(totals.shifts, 3);
    assert.equal(round(totals.ctp), 631.4);
    assert.equal(round(totals.grt), 196.8);
    assert.equal(round(totals.total), 828.2);
    assert.equal(round(totals.cash), 128);
    // The stated total is CTP + GRT and holds no cash.
    assert.equal(round(totals.total), round(totals.ctp + totals.grt));
});

test("the subscription window is the listed days plus their pay period, and nothing else", () => {
    const keys = getPayStatementSubscriptionKeys(new Date(2026, 7, 7), new Date(2026, 7, 13));

    // The pay period the week sits in - Jul 31 to Aug 13 - so the period block
    // has its own numbers without a second, unbounded read.
    assert.equal(keys[0], "2026-07-31");
    assert.equal(keys.at(-1), "2026-08-13");
    assert.equal(keys.length, 14);
    assert.deepEqual(getPayStatementSubscriptionKeys(null, null), []);
});

test("the history boundary is a fixed date, not a rolling window", () => {
    // A relative window would quietly start hiding real pay as time passed, and
    // would tell a different story to each person reading it.
    assert.equal(PAY_RECORDS_START_KEY, "2026-06-23");
});

function round(value) {
    return Math.round(value * 100) / 100;
}
