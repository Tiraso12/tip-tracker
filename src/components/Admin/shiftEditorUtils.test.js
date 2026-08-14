import assert from "node:assert/strict";
import test from "node:test";

import {
    applyBarFoodSalesEdit,
    deriveRunnersFee,
    fmtAmount,
    getPayoutNonCashTotal,
    getTeamSummary,
    isNegativeMoney,
    isRunnersFeeOverridden,
    selectNegativePayouts,
    selectSpotCheckSubject,
    validateShiftInputs,
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

// Total on the card is CTP + GRT and never includes cash. Newly stored totals now
// agree, but ledger docs written before that rule fold cash in for dining staff -
// the fixture below is one - so the card must compute rather than read the field.
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

// ---- The bar's Runners Fee, derived from the bar's food sales ----

test("the fee prefills at 3% of bar food sales, to the cent", () => {
    assert.equal(deriveRunnersFee(10000), 300);
    assert.equal(deriveRunnersFee("10000"), 300);
    assert.equal(deriveRunnersFee(1234.56), 37.04);
    assert.equal(deriveRunnersFee(""), 0);
});

test("entering food sales fills an untouched fee and keeps following it", () => {
    const first = applyBarFoodSalesEdit({ tips: "200", runners: "" }, "10000");
    assert.equal(first.runners, "300");
    assert.equal(first.foodSales, "10000");
    // Other bar money is carried through untouched.
    assert.equal(first.tips, "200");

    // Still tracking, so a corrected food sales figure re-derives the fee.
    assert.equal(applyBarFoodSalesEdit(first, "12000").runners, "360");

    // Clearing food sales clears the fee with it - they move as a pair while derived.
    assert.equal(applyBarFoodSalesEdit(first, "").runners, "");
});

// A hand-set amount is somebody's decision - the rate is not always 3% - so nothing
// about a later food sales edit may overwrite it.
test("a fee set by hand survives every later food sales edit", () => {
    const overridden = { foodSales: "10000", runners: "400" };

    assert.equal(applyBarFoodSalesEdit(overridden, "12000").runners, "400");
    assert.equal(applyBarFoodSalesEdit(overridden, "").runners, "400");
});

// THE HISTORICAL CASE. Every shift settled before this field existed stores a fee that
// was typed blind, with no food sales figure behind it. Entering one now must not
// re-derive that night's fee: it would move settled money on a number nobody checked.
test("entering food sales on a shift from before the field leaves its typed fee alone", () => {
    const storedUnderTheOldModel = { tips: "200", runners: "500" };

    const edited = applyBarFoodSalesEdit(storedUnderTheOldModel, "10000");

    assert.equal(edited.runners, "500");
    assert.equal(edited.foodSales, "10000");
});

// The marker says "somebody set this by hand", and says nothing the rest of the time.
// The quiet case that matters most is the historical one: a fee with no food sales
// figure behind it has no computed value to disagree with, and marking every shift
// settled before the field existed as "edited" would be noise, not information.
test("the edited marker is quiet on a derived fee and on a shift with no food sales", () => {
    assert.equal(isRunnersFeeOverridden({ foodSales: "10000", runners: "300" }), false);
    assert.equal(isRunnersFeeOverridden({ runners: "500" }), false);
    assert.equal(isRunnersFeeOverridden({ foodSales: "", runners: "500" }), false);
    assert.equal(isRunnersFeeOverridden({}), false);

    assert.equal(isRunnersFeeOverridden({ foodSales: "10000", runners: "400" }), true);
    // Down to the cent, both ways.
    assert.equal(isRunnersFeeOverridden({ foodSales: "10000", runners: "299.99" }), true);
});

test("bar food sales is validated as money, in the captain's words", () => {
    const errors = validateShiftInputs({
        teams: [],
        barTeam: { members: [{ uid: "bar-1" }], pools: { foodSales: "-1", runners: "-2" } },
        runners: [],
    });

    assert.ok(errors.includes("Bar food sales cannot be negative."));
    assert.ok(errors.includes("Bar runners fee cannot be negative."));
});

// ---- A night that records someone at a negative amount ----
//
// A negative is CORRECT - the bar's fee comes out of CTP, so a contract-only night
// leaves the CTP side below zero and the week nets it out. Nothing may block it; the
// screen just has to say so. This picks out who to name.
test("a negative night names whoever it records at a negative amount", () => {
    const negatives = selectNegativePayouts([
        { uid: "bar-1", name: "Bar One", role: "bartender", tips: -300, gratuity: 100 },
        { uid: "server-1", name: "Server One", role: "server", tips: 300, gratuity: 1800 },
    ]);

    assert.deepEqual(negatives, [
        { uid: "bar-1", name: "Bar One", role: "bartender", total: -200 },
    ]);
});

test("a negative CTP covered by the same night's gratuity is not a negative night", () => {
    // Take-home is positive, so saying "you are negative" here would be a false alarm.
    assert.deepEqual(
        selectNegativePayouts([{ uid: "bar-1", name: "Bar One", tips: -300, gratuity: 500 }]),
        [],
    );
});

test("cash never decides whether a night is negative", () => {
    // Cash is paid and reported separately and is never folded into a total, so it can
    // neither create a negative night nor cover one up.
    assert.deepEqual(
        selectNegativePayouts([{ uid: "server-1", name: "Server One", tips: -50, gratuity: 0, cash: 200 }]),
        [{ uid: "server-1", name: "Server One", role: undefined, total: -50 }],
    );
});
