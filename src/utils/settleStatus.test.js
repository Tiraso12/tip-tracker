import assert from "node:assert/strict";
import test from "node:test";

import { getGroupMoneyStatus, summarizeGroupStatuses } from "./settleStatus.js";

test("a group with no people is never in play", () => {
    assert.equal(getGroupMoneyStatus({ hasPeople: false, pool: 0 }), "empty");
    assert.equal(getGroupMoneyStatus({ hasPeople: false, pool: 500 }), "empty");
});

test("funded means the tip pool (tips + gratuity) is above zero", () => {
    assert.equal(getGroupMoneyStatus({ hasPeople: true, pool: 300 }), "funded");
});

test("sales/cash alone is amber 'sales-only', not a green done", () => {
    // This is the F5 false-positive: Sales typed, pool still $0.
    assert.equal(getGroupMoneyStatus({ hasPeople: true, pool: 0, hasOtherInput: true }), "sales-only");
});

test("people assigned but nothing entered reads empty", () => {
    assert.equal(getGroupMoneyStatus({ hasPeople: true, pool: 0, hasOtherInput: false }), "empty");
});

test("summary counts only in-play groups and how many still need money", () => {
    const groups = [
        { hasPeople: true, status: "funded" },
        { hasPeople: true, status: "sales-only" },
        { hasPeople: true, status: "empty" },
        { hasPeople: false, status: "empty" }, // bar with no roster - not in play
    ];
    assert.deepEqual(summarizeGroupStatuses(groups), { total: 3, funded: 1, needsMoney: 2 });
});

test("summary is all-funded when every in-play group has money in", () => {
    const groups = [
        { hasPeople: true, status: "funded" },
        { hasPeople: true, status: "funded" },
        { hasPeople: false, status: "empty" },
    ];
    assert.deepEqual(summarizeGroupStatuses(groups), { total: 2, funded: 2, needsMoney: 0 });
});
