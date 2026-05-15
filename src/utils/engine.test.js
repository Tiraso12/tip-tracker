import assert from "node:assert/strict";
import test from "node:test";
import { calculateShift } from "./engine.js";

const getOnly = (items) => {
    assert.equal(items.length, 1);
    return items[0];
};

test("calculates a balanced role-point shift with bar CTP allocation", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "captain-1", name: "Captain One", role: "captain" },
                    { uid: "server-1", name: "Server One", role: "server" },
                    { uid: "back-1", name: "Back One", role: "back" },
                    { uid: "assistant-1", name: "Assistant One", role: "assistant" },
                ],
                pools: { sales: 10000, tips: 1000, cash: 200, gratuity: 500 },
                contracts: [],
            },
        ],
        barTeam: {
            members: [{ uid: "bar-1", name: "Bar One", role: "bartender", points: 1 }],
            pools: {},
        },
        runners: [],
    });

    assert.deepEqual(result.validations, []);
    assert.equal(result.balances.overallBalance, 0);
    assert.equal(result.balances.totalAvailable, 1700);
    assert.equal(result.balances.totalDistributed, 1700);
    assert.equal(result.pointTotals.totalAllTeamPoints, 12.5);

    assert.deepEqual(result.allocations, {
        barCTPAllocation: 100,
        doorCTPAllocation: 50,
        captainOverrideCTP: 100,
        barGRTAllocation: 0,
        doorGRTAllocation: 0,
        peCoordinatorGRT: 0,
        captainOverrideGRT: 0,
        houseAllocation: 0,
        totalRunnerPay: 0,
    });

    const captain = getOnly(result.payouts.roleGrouped.captains);
    const server = getOnly(result.payouts.roleGrouped.servers);
    const back = getOnly(result.payouts.roleGrouped.backs);
    const assistant = getOnly(result.payouts.roleGrouped.assistants);
    const bartender = getOnly(result.payouts.roleGrouped.bar);

    assert.deepEqual(
        [captain.total, server.total, back.total, assistant.total, bartender.total],
        [564, 464, 290, 232, 100],
    );

    assert.deepEqual(result.balances.poolBalances, {
        "Dining Room CTP": 0,
        "Team CASH": 0,
        "Team GRT": 0,
        "Bar CTP": 0,
        "Bar GRT": 0,
        "Cap Ov CTP": 0,
        "Cap Ov GRT": 0,
    });
});

test("balances contract gratuity, bar pools, runner payout, and bar transfer", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "captain-1", name: "Captain One", role: "captain" },
                    { uid: "server-1", name: "Server One", role: "server" },
                ],
                pools: { sales: 10000, tips: 1000, cash: 0, gratuity: 0 },
                contracts: [{ gratuity: 260 }],
            },
        ],
        barTeam: {
            members: [
                { uid: "bar-1", name: "Bar One", role: "bartender", points: 1 },
                { uid: "bar-2", name: "Bar Two", role: "bartender", points: 1 },
            ],
            pools: { sales: 2000, tips: 100, gratuity: 50, runners: 25 },
        },
        runners: [{ uid: "runner-1", name: "Runner One", role: "runner", payoutAmount: 102 }],
    });

    assert.deepEqual(result.validations, []);
    assert.equal(result.balances.overallBalance, 0);
    assert.equal(result.balances.totalAvailable, 1410);
    assert.equal(result.balances.totalDistributed, 1410);

    assert.equal(result.derivedValues.contractSales, 1000);
    assert.equal(result.derivedValues.regularSalesBase, 9000);
    assert.equal(result.derivedValues.barSales, 2000);
    assert.equal(result.allocations.totalRunnerPay, 102);

    const captain = getOnly(result.payouts.roleGrouped.captains);
    const server = getOnly(result.payouts.roleGrouped.servers);
    const runner = getOnly(result.payouts.roleGrouped.runners);

    assert.equal(captain.total, 534);
    assert.equal(server.total, 434);
    assert.equal(runner.payoutAmount, 102);
    assert.deepEqual(
        result.payouts.roleGrouped.bar.map((payout) => payout.total),
        [112.5, 112.5],
    );
});

test("warns when bar allocation exists but no bar points are assigned", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [{ uid: "server-1", name: "Server One", role: "server" }],
                pools: { sales: 10000, tips: 1000, cash: 0, gratuity: 0 },
                contracts: [],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [],
    });

    assert.match(result.validations.join("\n"), /Positive bar pools exist but there are no bar points assigned/);
    assert.equal(result.balances.poolBalances["Bar CTP"], 100);
    assert.equal(result.balances.poolBalances["Cap Ov CTP"], 100);
    assert.equal(result.balances.overallBalance, 200);
});

test("reconciles rounding to keep distributed totals balanced", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "server-1", name: "Server One", role: "server", points: 1 },
                    { uid: "server-2", name: "Server Two", role: "server", points: 1 },
                    { uid: "server-3", name: "Server Three", role: "server", points: 1 },
                ],
                pools: { sales: 0, tips: 100, cash: 100, gratuity: 100 },
                contracts: [],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [],
    });

    const payouts = result.payouts.teamPayouts[0].payouts;

    assert.equal(result.balances.overallBalance, 0);
    assert.equal(payouts.reduce((sum, payout) => sum + payout.ctp, 0), 100);
    assert.equal(payouts.reduce((sum, payout) => sum + payout.cash, 0), 100);
    assert.equal(payouts.reduce((sum, payout) => sum + payout.grt, 0), 100);
});
