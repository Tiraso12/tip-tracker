import assert from "node:assert/strict";
import test from "node:test";

import {
    clearMarkOnEdit,
    getGroupCloseState,
    getGroupMoneyStatus,
    summarizeCloseReadiness,
    summarizeGroupStatuses,
} from "./settleStatus.js";

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

test("close state: no people is never in play, regardless of markedDone", () => {
    assert.equal(getGroupCloseState({ hasPeople: false, pool: 500, markedDone: true }), "empty");
});

test("close state: markedDone wins over the money read - a marked-done $0 team is done, not entering", () => {
    assert.equal(getGroupCloseState({ hasPeople: true, pool: 0, markedDone: true }), "done");
});

test("close state: money or other input typed but not marked done is 'entering'", () => {
    assert.equal(getGroupCloseState({ hasPeople: true, pool: 300, markedDone: false }), "entering");
    assert.equal(getGroupCloseState({ hasPeople: true, pool: 0, hasOtherInput: true, markedDone: false }), "entering");
});

test("close state: nothing entered and not marked done is 'still on tables'", () => {
    assert.equal(getGroupCloseState({ hasPeople: true, pool: 0, hasOtherInput: false, markedDone: false }), "working");
});

test("clearMarkOnEdit only fires the quiet cue when a mark actually existed", () => {
    assert.deepEqual(clearMarkOnEdit(true), { markedDone: false, justCleared: true });
    assert.deepEqual(clearMarkOnEdit(false), { markedDone: false, justCleared: false });
});

test("close readiness gate excludes Runners by kind and empty groups by hasPeople", () => {
    const groups = [
        { kind: "dining", name: "Team 1", hasPeople: true, markedDone: true },
        { kind: "dining", name: "Team 2", hasPeople: true, markedDone: false },
        { kind: "bar", name: "Bar Team", hasPeople: true, markedDone: false },
        { kind: "dining", name: "Team 3", hasPeople: false, markedDone: false },
        { kind: "runners", name: "Runners", hasPeople: true, markedDone: false },
    ];
    assert.deepEqual(summarizeCloseReadiness(groups), {
        total: 3,
        done: 1,
        stillOpen: 2,
        openNames: ["Team 2", "Bar Team"],
        ready: false,
    });
});

test("close readiness is ready once every gated group is marked done", () => {
    const groups = [
        { kind: "dining", name: "Team 1", hasPeople: true, markedDone: true },
        { kind: "bar", name: "Bar Team", hasPeople: true, markedDone: true },
        { kind: "runners", name: "Runners", hasPeople: true, markedDone: false },
    ];
    assert.deepEqual(summarizeCloseReadiness(groups), {
        total: 2,
        done: 2,
        stillOpen: 0,
        openNames: [],
        ready: true,
    });
});
