import assert from "node:assert/strict";
import test from "node:test";

import {
    fmtAmount,
    getPayoutNonCashTotal,
    getTeamSummary,
    isNegativeMoney,
    selectSpotCheckSubject,
} from "./shiftEditorUtils.js";

test("team display pool excludes cash while keeping cash separate", () => {
    const summary = getTeamSummary({
        pools: {
            tips: "200",
            gratuity: "100",
            cash: "50",
            sales: "1000",
            covers: "12",
        },
        contracts: [{ gratuity: "26" }],
    });

    assert.equal(summary.payoutPool, 326);
    assert.equal(summary.cash, 50);
});

// The Review spot check is compared by eye against a spreadsheet whose captain worked
// the full night, so the subject must be a captain at full point weighting - a captain
// who left early takes home less and would read as a mismatch that is not one.
test("spot check prefers the first captain at full points over an earlier partial captain", () => {
    const subject = selectSpotCheckSubject([
        { uid: "a", name: "Early Captain", role: "captain", points: 2 },
        { uid: "b", name: "Full Captain", role: "captain", points: 4 },
        { uid: "c", name: "Server One", role: "server", points: 4 },
    ]);

    assert.equal(subject.payout.uid, "b");
    assert.equal(subject.atFullPoints, true);
    assert.equal(subject.isCaptain, true);
});

test("spot check falls back to the first captain when none is at full points, flagged not silent", () => {
    const subject = selectSpotCheckSubject([
        { uid: "a", name: "Early Captain", role: "captain", points: 2 },
        { uid: "b", name: "Server One", role: "server", points: 4 },
    ]);

    assert.equal(subject.payout.uid, "a");
    assert.equal(subject.atFullPoints, false);
    assert.equal(subject.isCaptain, true);
});

test("spot check falls back to the first row when there is no captain at all", () => {
    const subject = selectSpotCheckSubject([
        { uid: "b", name: "Server One", role: "server", points: 4 },
    ]);

    assert.equal(subject.payout.uid, "b");
    assert.equal(subject.atFullPoints, false);
    assert.equal(subject.isCaptain, false);
});

test("spot check returns null rather than throwing on an empty roster", () => {
    assert.equal(selectSpotCheckSubject([]), null);
    assert.equal(selectSpotCheckSubject(), null);
});

// A captain carrying MORE than the standard weighting is still at least a full shift,
// so it is a valid subject rather than a flagged fallback.
test("spot check treats an above-standard captain as full points", () => {
    const subject = selectSpotCheckSubject([
        { uid: "a", name: "Captain One", role: "captain", points: 5 },
    ]);

    assert.equal(subject.atFullPoints, true);
});

// The card's decimal points must line up down the column, so every figure carries
// exactly two decimals and the sign is rendered separately from the digits.
test("hero amounts always carry two decimals and no currency glyph", () => {
    assert.equal(fmtAmount(274.67), "274.67");
    assert.equal(fmtAmount(40), "40.00");
    assert.equal(fmtAmount(1510.5), "1,510.50");
    assert.equal(fmtAmount(""), "0.00");
    assert.equal(fmtAmount(-18), "18.00");
    assert.equal(isNegativeMoney(-18), true);
    assert.equal(isNegativeMoney(0), false);
});

// Total on the card is CTP + GRT and never includes cash. The stored per-person
// `total` folds cash in for dining staff, so the card must compute rather than read it.
test("spot check total is CTP + GRT and ignores both cash and the stored total", () => {
    const diningPayout = { tips: 274.67, gratuity: 86.67, cash: 40, total: 401.33 };

    assert.equal(getPayoutNonCashTotal(diningPayout).toFixed(2), "361.34");
});

// A runner has no CTP/GRT/cash in the engine - only a flat payout - so the card shows
// one Runner pay figure instead of two meaningless $0.00 rows.
test("a runner payout resolves to its flat pay as a single figure", () => {
    const runnerPayout = { tips: 85, gratuity: 0, cash: 0, payoutAmount: 85, role: "runner" };

    assert.equal(getPayoutNonCashTotal(runnerPayout), 85);
    assert.equal(selectSpotCheckSubject([runnerPayout]).payout.role, "runner");
});
