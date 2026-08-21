import assert from "node:assert/strict";
import test from "node:test";

import { calculateShift } from "./engine.js";
import { describeShiftBalance } from "./shiftBalance.js";

const team = (members, pools = {}, contracts = []) => ({
    teamId: "team-1",
    members,
    pools: { sales: 0, tips: 0, gratuity: 0, cash: 0, ...pools },
    contracts,
});

const describe = (input) => describeShiftBalance({
    result: calculateShift(input),
    teams: input.teams,
    barTeam: input.barTeam,
});

test("a balanced shift says nothing", () => {
    const report = describe({
        teams: [team(
            [{ uid: "c1", name: "Cap", role: "captain" }, { uid: "s1", name: "Server One", role: "server" }],
            { sales: 10000, tips: 1000, gratuity: 200, cash: 400 },
            [{ name: "Party", gratuity: 1300 }],
        )],
        barTeam: { members: [{ uid: "b1", name: "Bar One", role: "bartender" }], pools: { tips: 300, sales: 2000, runners: 50 } },
        runners: [{ uid: "r1", name: "Runner One", role: "runner", payoutAmount: 85 }],
    });

    assert.equal(report.balanced, true);
    assert.deepEqual(report.leftovers, []);
});

// A one-server night used to strand the 1% captain override and could not be closed
// at all. The engine now skips that carve-out when nobody works as Captain, so this
// night balances - and this reporting must say nothing about it rather than inventing
// a leftover. Paired with engine.test.js, which pins the money side of the same change.
test("a night with no captain balances and is not reported as blocked", () => {
    const report = describe({
        teams: [team([{ uid: "s1", name: "Server One", role: "server" }], { sales: 10000, tips: 1000 })],
        barTeam: { members: [], pools: {} },
        runners: [],
    });

    assert.equal(report.balanced, true);
    assert.deepEqual(report.leftovers, []);
});

// The reachable blockers left: Settle up lets money be typed against a group that
// has nobody in it. Pinned by amount AND wording - this is the sentence a captain
// reads at 2am instead of "Failed to save."
test("bar money with nobody in the Bar Team is named as bar money", () => {
    const report = describe({
        teams: [team(
            [{ uid: "c1", name: "Cap", role: "captain" }, { uid: "s1", name: "Server One", role: "server" }],
            { sales: 10000, tips: 1000 },
        )],
        barTeam: { members: [], pools: { tips: 500 } },
        runners: [],
    });

    assert.equal(report.amount, 500);
    assert.equal(report.headline, "$500.00 of this shift's money is not reaching anyone.");
    assert.deepEqual(report.leftovers.map(item => [item.label, item.amount]), [["Bar CTP", 500]]);
    assert.equal(report.leftovers[0].hint, "Nobody is in the Bar Team, so there is nobody to split it.");
});

// Cash has its own side of the books, so stranded cash never shows up in the
// non-cash pool ledger on Review - this notice is the only place it is named.
test("cash entered with nobody on a dining team is named as cash", () => {
    const report = describe({
        teams: [team([], { cash: 250 })],
        barTeam: { members: [{ uid: "b1", name: "Bar One", role: "bartender" }], pools: { tips: 100 } },
        runners: [],
    });

    assert.equal(report.amount, 250);
    assert.deepEqual(report.leftovers.map(item => [item.label, item.amount]), [["Dining room cash", 250]]);
});

// The engine's per-pool residuals are the source of every figure above, so the
// claim they sum to the overall balance is the load-bearing one.
test("the named leftovers account for the whole imbalance", () => {
    const report = describe({
        teams: [team([{ uid: "s1", name: "Server One", role: "server" }], { sales: 10000, tips: 1000 })],
        barTeam: { members: [], pools: { tips: 500, gratuity: 250 } },
        runners: [],
    });

    const named = report.leftovers.reduce((sum, item) => sum + item.amount, 0);
    assert.equal(Math.round(named * 100) / 100, report.overallBalance);
});
