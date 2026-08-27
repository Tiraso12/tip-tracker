import assert from "node:assert/strict";
import test from "node:test";
import { calculateShift, formatContractRate, getContractRate } from "./engine.js";
import { RUNNER_FLAT_RATE } from "./constants.js";
import { buildPayoutLedgerEntry, reconcilePayoutLedger } from "./payoutLedger.js";
import { mapPayoutsForFirebase } from "../components/Admin/shiftEditorUtils.js";

const r2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const getOnly = (items) => {
    assert.equal(items.length, 1);
    return items[0];
};

// The save gate, run exactly the way Confirm & Save runs it: the engine result is
// mapped to the Firebase payout map, each payout becomes a ledger entry, and
// reconcilePayoutLedger passes judgement. `saveClosedShiftAtomically` throws before
// writing anything when this is not ok, so a shift that fails here cannot be settled.
const settleGate = (result) => {
    const entries = Object.entries(mapPayoutsForFirebase(result)).map(([uid, payout]) =>
        buildPayoutLedgerEntry({ date: "2026-08-14", uid, payout, operationId: "test-op" }),
    );

    return reconcilePayoutLedger({ summary: result, entries });
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

    // `total` is CTP + GRT for every role. Cash is paid separately and stays out
    // of it - these dining totals are each exactly their cash short of the
    // employee's full take-home, which is the intended reporting split.
    assert.deepEqual(
        [captain.total, server.total, back.total, assistant.total, bartender.total],
        [500, 400, 250, 200, 100],
    );
    assert.deepEqual(
        [captain.cash, server.cash, back.cash, assistant.cash, bartender.cash],
        [64, 64, 40, 32, 0],
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

test("pays a non-captain profile as captain when assigned to work captain on the shift", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    {
                        uid: "server-working-captain",
                        name: "Server Working Captain",
                        profileRole: "server",
                        role: "captain",
                    },
                    { uid: "server-1", name: "Server One", role: "server" },
                ],
                pools: { sales: 10000, tips: 1000, cash: 0, gratuity: 0 },
                contracts: [],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [],
    });

    assert.deepEqual(result.validations, []);
    assert.equal(result.balances.overallBalance, 0);
    assert.equal(result.allocations.captainOverrideCTP, 100);

    const workedCaptain = getOnly(result.payouts.roleGrouped.captains);
    const server = getOnly(result.payouts.roleGrouped.servers);

    assert.equal(workedCaptain.uid, "server-working-captain");
    assert.equal(workedCaptain.role, "captain");
    assert.equal(workedCaptain.points, 4);
    assert.equal(server.points, 4);
    assert.equal(workedCaptain.ctp, 525);
    assert.equal(server.ctp, 425);
});

test("defaults runner payout to the configured flat rate", () => {
    const result = calculateShift({
        teams: [],
        barTeam: { members: [], pools: {} },
        runners: [{ uid: "runner-1", name: "Runner One", role: "runner" }],
    });

    const runner = getOnly(result.payouts.roleGrouped.runners);

    assert.equal(result.allocations.totalRunnerPay, RUNNER_FLAT_RATE);
    assert.equal(result.runnerDeductionsByPool["Dining Room CTP"], RUNNER_FLAT_RATE);
    assert.equal(runner.payoutAmount, RUNNER_FLAT_RATE);
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

test("skips bar allocations when no bar team exists", () => {
    // With no bar team, barCTPAllocation and barGRTAllocation must be 0 so no money
    // is carved out for a bar that isn't working the shift.
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

    assert.equal(result.allocations.barCTPAllocation, 0);
    assert.equal(result.allocations.barGRTAllocation, 0);
    assert.equal(result.balances.poolBalances["Bar CTP"], 0);
    assert.equal(result.balances.overallBalance, 0);
});

test("pure contract/buyout shift: no regular sales, no bar team, runners paid from GRT", () => {
    // Buyout scenario: only contract gratuity entered, no bar team, runners still present.
    // contractSales = 2600 / 0.26 = 10000
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "captain-1", name: "Captain", role: "captain" },
                    { uid: "server-1", name: "Server One", role: "server" },
                    { uid: "server-2", name: "Server Two", role: "server" },
                ],
                pools: { sales: 0, tips: 0, cash: 0, gratuity: 0 },
                contracts: [{ gratuity: 2600 }],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [{ uid: "runner-1", name: "Runner One", role: "runner", payoutAmount: 102 }],
    });

    // Expected warnings for a pure buyout: contract sales exceed regular sales (0),
    // and CTP pool is negative because runner pay always deducts from CTP.
    assert.match(result.validations.join("\n"), /Contract sales exceed total team sales/);
    assert.match(result.validations.join("\n"), /Dining Room CTP pool is negative/);
    assert.equal(result.balances.overallBalance, 0);
    assert.equal(result.balances.totalAvailable, 2600);
    assert.equal(result.balances.totalDistributed, 2600);

    // Bar allocations must be 0 (no bar team)
    assert.equal(result.allocations.barCTPAllocation, 0);
    assert.equal(result.allocations.barGRTAllocation, 0);

    // Runner always deducts from CTP
    assert.equal(result.allocations.totalRunnerPay, 102);
    assert.equal(result.runnerDeductionsByPool["Dining Room CTP"], 102);

    // Captain earns more than server due to captain override GRT
    const captain = result.payouts.roleGrouped.captains[0];
    const server = result.payouts.roleGrouped.servers[0];
    assert.ok(captain.total > server.total);
});

// Contracts / REO gratuity stepped from 26% to 27% for shifts dated 2026-08-26
// onward (restaurant rule change, not an engine choice) - see docs/MONEY-MODEL.md.
// The cutoff keys on the SHIFT's own date, never the clock when the editor is
// opened, so an already-paid 26% night stays 26% forever even if it's re-saved
// today.
test("contract sales divide by 26% for a shift dated before the 2026-08-26 rate change", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [{ uid: "server-1", name: "Server One", role: "server" }],
                pools: { sales: 0, tips: 0, cash: 0, gratuity: 0 },
                contracts: [{ gratuity: 260 }],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [],
        date: "2026-08-25",
    });

    assert.equal(result.derivedValues.contractSales, 1000);
});

test("contract sales divide by 27% for a shift dated 2026-08-26 or later", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [{ uid: "server-1", name: "Server One", role: "server" }],
                pools: { sales: 0, tips: 0, cash: 0, gratuity: 0 },
                contracts: [{ gratuity: 270 }],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [],
        date: "2026-08-26",
    });

    assert.equal(result.derivedValues.contractSales, 1000);
});

test("contract sales stay on 26% when no date is passed (undated callers never jump to 27%)", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [{ uid: "server-1", name: "Server One", role: "server" }],
                pools: { sales: 0, tips: 0, cash: 0, gratuity: 0 },
                contracts: [{ gratuity: 260 }],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [],
    });

    assert.equal(result.derivedValues.contractSales, 1000);
});

// Every screen that quotes the contract rate labels it with this, so the label and
// the divisor cannot drift apart. Before this existed, three surfaces carried a
// literal "27%" and mislabelled every pre-cutoff night the captain reopened.
test("the contract rate label follows the same shift date the engine divides by", () => {
    assert.equal(formatContractRate("2026-08-25"), "26%");
    assert.equal(formatContractRate("2026-08-26"), "27%");
    assert.equal(formatContractRate("2026-09-01"), "27%");
    assert.equal(formatContractRate(undefined), "26%");

    for (const date of ["2026-08-25", "2026-08-26", "2026-09-01", undefined]) {
        const result = calculateShift({
            teams: [
                {
                    teamId: "team-1",
                    members: [{ uid: "server-1", name: "Server One", role: "server" }],
                    pools: { sales: 0, tips: 0, cash: 0, gratuity: 0 },
                    contracts: [{ gratuity: 1000 }],
                },
            ],
            barTeam: { members: [], pools: {} },
            runners: [],
            date,
        });

        assert.equal(formatContractRate(date), `${Math.round(getContractRate(date) * 100)}%`);
        assert.equal(result.derivedValues.contractSales, r2(1000 / getContractRate(date)));
    }
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

    // The rounding pass rewrites the last payout's total; it must rewrite it to
    // CTP + GRT, not sneak the cash adjustment back in.
    payouts.forEach((payout) => {
        assert.equal(payout.total, r2(payout.ctp + payout.grt));
    });
    assert.equal(payouts.reduce((sum, payout) => sum + payout.total, 0), 200);
});

// THE CONTRACT: `total` means CTP + GRT for every role. Cash is always paid and
// reported separately and must never be folded into a total. This test walks the
// whole shape of a shift - dining, bar, runners, cash-heavy and cash-free teams -
// so no future edit can quietly reintroduce a cash-inclusive total for one role.
test("total excludes cash for every role, dining and bar alike", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "captain-1", name: "Captain One", role: "captain" },
                    { uid: "server-1", name: "Server One", role: "server" },
                ],
                pools: { sales: 12000, tips: 1800, cash: 400, gratuity: 300 },
                contracts: [{ gratuity: 260 }],
            },
            {
                teamId: "team-2",
                members: [{ uid: "back-1", name: "Back One", role: "back" }],
                pools: { sales: 4000, tips: 600, cash: 0, gratuity: 0 },
                contracts: [],
            },
        ],
        barTeam: {
            members: [{ uid: "bar-1", name: "Bar One", role: "bartender", points: 2 }],
            pools: { sales: 3000, tips: 500, gratuity: 100 },
        },
        runners: [{ uid: "runner-1", name: "Runner One", role: "runner", payoutAmount: 90 }],
    });

    const { captains, servers, backs, assistants, bar } = result.payouts.roleGrouped;
    const staff = [...captains, ...servers, ...backs, ...assistants, ...bar];

    assert.equal(staff.length, 4);
    // At least one dining payout actually carries cash, or this proves nothing.
    assert.ok(staff.some((payout) => payout.cash > 0));

    staff.forEach((payout) => {
        assert.equal(
            payout.total,
            r2(payout.ctp + payout.grt),
            `${payout.name} total must be CTP + GRT`,
        );
    });

    // Cash is still fully distributed - it moved out of `total`, it did not vanish.
    assert.equal(
        r2(staff.reduce((sum, payout) => sum + (payout.cash || 0), 0)),
        result.adjustedPools.adjustedTeamCashPool,
    );
    assert.equal(result.balances.overallBalance, 0);
});

// THE CAPTAIN OVERRIDE, on a night nobody works as Captain.
//
// The 1% is not taken at all: it stays in the dining pools the team splits rather
// than going to the house. Before this it was carved out regardless, paid to nobody,
// and the resulting imbalance made the shift impossible to settle - the ledger
// reconciliation throws, so a one-server night could not be closed at all. These
// three tests pin the money AND the settle gate, because the balance was only ever
// half the failure.
test("no captain on the floor: the CTP override is not taken and the whole pool is paid out", () => {
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

    assert.equal(result.allocations.captainOverrideCTP, 0);
    assert.equal(result.balances.poolBalances["Cap Ov CTP"], 0);
    assert.deepEqual(result.validations, []);
    assert.equal(result.balances.overallBalance, 0);

    // $1,000 of tips, less the 0.5% door on $10,000. Nothing else leaves.
    const server = getOnly(result.payouts.roleGrouped.servers);
    assert.equal(result.allocations.doorCTPAllocation, 50);
    assert.equal(server.ctp, 950);
    assert.equal(server.total, 950);

    assert.deepEqual(settleGate(result).messages, []);
});

test("no captain on a contract night: the GRT override is not taken either", () => {
    // 2600 of contract gratuity implies 10000 of contract sales at the fixed 26%.
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "server-1", name: "Server One", role: "server" },
                    { uid: "back-1", name: "Back One", role: "back" },
                ],
                pools: { sales: 0, tips: 0, cash: 0, gratuity: 0 },
                contracts: [{ gratuity: 2600 }],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [],
    });

    assert.equal(result.allocations.captainOverrideGRT, 0);
    assert.equal(result.balances.poolBalances["Cap Ov GRT"], 0);
    assert.equal(result.balances.overallBalance, 0);

    // The house-side allocations are untouched: door 2%, PE coordinator 2%, house 3%
    // of contract sales still come off, and only the captain's 1% stays with staff.
    assert.equal(result.allocations.doorGRTAllocation, 200);
    assert.equal(result.allocations.peCoordinatorGRT, 200);
    assert.equal(result.allocations.houseAllocation, 300);
    assert.equal(result.adjustedPools.adjustedTeamGRTPool, 1900);

    const server = getOnly(result.payouts.roleGrouped.servers);
    const back = getOnly(result.payouts.roleGrouped.backs);
    assert.equal(r2(server.grt + back.grt), 1900);

    assert.deepEqual(settleGate(result).messages, []);
});

// The other half of the same guarantee: skipping the carve-out must not move a
// single cent on a night that DOES have a captain. Every figure below is the value
// this shift produced before the skip existed.
test("with a captain on the floor: both overrides are taken and every payout is unchanged", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "captain-1", name: "Captain One", role: "captain" },
                    { uid: "server-1", name: "Server One", role: "server" },
                    { uid: "back-1", name: "Back One", role: "back" },
                ],
                pools: { sales: 10000, tips: 1000, cash: 200, gratuity: 300 },
                contracts: [{ gratuity: 1300 }],
            },
        ],
        barTeam: {
            members: [{ uid: "bar-1", name: "Bar One", role: "bartender", points: 1 }],
            pools: { sales: 2000, tips: 200, gratuity: 50, runners: 25 },
        },
        runners: [{ uid: "runner-1", name: "Runner One", role: "runner", payoutAmount: 85 }],
    });

    // Regular sales base is 5000 (10000 less the 5000 implied by 1300 of contract
    // gratuity), so the CTP override is 50; contract sales are 5000, so the GRT
    // override is 50 as well.
    assert.deepEqual(result.allocations, {
        barCTPAllocation: 50,
        doorCTPAllocation: 25,
        captainOverrideCTP: 50,
        barGRTAllocation: 50,
        doorGRTAllocation: 100,
        peCoordinatorGRT: 100,
        captainOverrideGRT: 50,
        houseAllocation: 150,
        totalRunnerPay: 85,
    });

    assert.deepEqual(result.validations, []);
    assert.equal(result.balances.overallBalance, 0);
    assert.equal(result.balances.totalAvailable, 3050);
    assert.equal(result.balances.totalDistributed, 3050);

    const captain = getOnly(result.payouts.roleGrouped.captains);
    const server = getOnly(result.payouts.roleGrouped.servers);
    const back = getOnly(result.payouts.roleGrouped.backs);
    const bartender = getOnly(result.payouts.roleGrouped.bar);
    const runner = getOnly(result.payouts.roleGrouped.runners);

    assert.deepEqual(
        [captain.ctp, captain.grt, captain.cash, captain.total],
        [360.48, 488.1, 76.19, 848.58],
    );
    assert.deepEqual(
        [server.ctp, server.grt, server.cash, server.total],
        [310.48, 438.1, 76.19, 748.58],
    );
    assert.deepEqual(
        [back.ctp, back.grt, back.cash, back.total],
        [194.04, 273.8, 47.62, 467.84],
    );
    assert.deepEqual(
        [bartender.ctp, bartender.grt, bartender.cash, bartender.total],
        [225, 100, 0, 325],
    );
    assert.equal(runner.payoutAmount, 85);

    // The captain is paid the whole override on both sides: $50 of CTP and $50 of
    // GRT above the server, who carries the same 4 points.
    assert.equal(r2(captain.ctp - server.ctp), 50);
    assert.equal(r2(captain.grt - server.grt), 50);

    assert.deepEqual(result.balances.poolBalances, {
        "Dining Room CTP": 0,
        "Team CASH": 0,
        "Team GRT": 0,
        "Bar CTP": 0,
        "Bar GRT": 0,
        "Cap Ov CTP": 0,
        "Cap Ov GRT": 0,
    });

    assert.deepEqual(settleGate(result).messages, []);
});

// Skipping the carve-out must not have quietly become a floor under the pools. A
// contract-only night pays its runners out of CTP that has no charged tip behind it,
// so the dining CTP pool goes negative and that is the system working - it nets out
// across the week against the positive nights. It must still be reachable, and the
// shift must still settle.
test("a no-captain contract night can still drive the dining CTP pool negative", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [{ uid: "server-1", name: "Server One", role: "server" }],
                pools: { sales: 0, tips: 0, cash: 0, gratuity: 0 },
                contracts: [{ gratuity: 2600 }],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [{ uid: "runner-1", name: "Runner One", role: "runner", payoutAmount: 102 }],
    });

    assert.match(result.validations.join("\n"), /Dining Room CTP pool is negative/);
    assert.ok(result.adjustedPools.adjustedTeamCTPPool < 0);
    assert.ok(getOnly(result.payouts.roleGrouped.servers).ctp < 0);
    assert.equal(result.balances.overallBalance, 0);
    assert.deepEqual(settleGate(result).messages, []);
});

// THE BAR'S RUNNERS FEE, AND WHY A NEGATIVE CTP IS THE SYSTEM WORKING.
//
// The fee IS 3% of the bar's total food sales, but the engine is deliberately not told
// that. Food sales prefills the AMOUNT at Settle up (`RUNNERS_FEE_FOOD_SALES_RATE`,
// applied in shiftEditorUtils) because the rate varies at a manager's discretion and
// they express that by editing the amount. What reaches the engine is the amount, so
// the figure below is recorded and spent on nothing.
//
// That is also what makes every shift settled before this field existed safe: their
// `pools.foodSales` is absent, and an absent food sales figure cannot move a cent.
test("bar food sales is recorded, and spends nothing", () => {
    const shift = (barPools) => calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "captain-1", name: "Captain One", role: "captain" },
                    { uid: "server-1", name: "Server One", role: "server" },
                ],
                pools: { sales: 10000, tips: 1000, cash: 200, gratuity: 300 },
                contracts: [],
            },
        ],
        barTeam: {
            members: [{ uid: "bar-1", name: "Bar One", role: "bartender", points: 1 }],
            pools: barPools,
        },
        runners: [],
    });

    // The same night twice: once as an already-settled shift is stored (no food sales
    // key at all), once with the figure the fee was derived from. Identical to the cent.
    const beforeTheField = shift({ sales: 2000, tips: 200, gratuity: 0, runners: 300 });
    const withFoodSales = shift({ sales: 2000, tips: 200, gratuity: 0, runners: 300, foodSales: 10000 });

    assert.deepEqual(withFoodSales.payouts.roleGrouped, beforeTheField.payouts.roleGrouped);
    assert.deepEqual(withFoodSales.allocations, beforeTheField.allocations);
    assert.deepEqual(withFoodSales.adjustedPools, beforeTheField.adjustedPools);
    assert.deepEqual(withFoodSales.balances, beforeTheField.balances);

    // Recorded on the shift's own summary, so the saved night carries what the fee
    // was derived from - and reads 0 on a night from before the field existed.
    assert.equal(withFoodSales.derivedValues.barFoodSales, 10000);
    assert.equal(beforeTheField.derivedValues.barFoodSales, 0);

    // And the fee itself still does the one thing it has always done: move CTP off
    // the bar pool and onto the dining pool. Neither side changed size.
    assert.equal(withFoodSales.balances.overallBalance, 0);
    assert.deepEqual(settleGate(withFoodSales).messages, []);
});

// THE CAPTAIN'S OWN SCENARIO, pinned so nobody "fixes" it.
//
// On a contract-only night every dollar arrives as gratuity and there is no charged tip
// to draw from, but the runners' pay still comes out of CTP - so the bar's CTP goes
// negative and the bartender's night is recorded as a negative amount. That is CORRECT.
// It balances out at the end of the week, where the CTP total subtracts the negative
// night from the positive ones.
//
// This test exists to make a clamp or a guard fail loudly. Do NOT add one: an earlier
// investigation proposed rejecting negative payouts and the captain declined it, with
// this exact night as the reason. What the shift must do is BALANCE and SETTLE.
test("a contract-only night pays the bar's Runners Fee out of CTP and records a negative", () => {
    const result = calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [{ uid: "server-1", name: "Server One", role: "server" }],
                pools: { sales: 10000, tips: 0, cash: 0, gratuity: 0 },
                contracts: [{ gratuity: 2600 }],
            },
        ],
        barTeam: {
            members: [{ uid: "bar-1", name: "Bar One", role: "bartender", points: 1 }],
            // $10,000 of bar food sales, so the fee prefilled at $300 - and no charged
            // tip behind it, because the whole night is a contract.
            pools: { sales: 0, tips: 0, gratuity: 0, foodSales: 10000, runners: 300 },
        },
        runners: [],
    });

    // The fee left the bar's CTP with nothing to leave from.
    assert.equal(result.adjustedPools.adjustedBarCTPPool, -300);
    assert.match(result.validations.join("\n"), /Bar CTP pool is negative/);

    const bartender = getOnly(result.payouts.roleGrouped.bar);
    assert.equal(bartender.ctp, -300);
    // The bar's 1% of contract sales still lands on the bar's GRT side, so the night
    // records this bartender at -$200: a real amount, netted against the week.
    assert.equal(bartender.grt, 100);
    assert.equal(bartender.total, -200);

    // ...and the same $300 is on the dining side, which is the whole point of the fee.
    assert.equal(getOnly(result.payouts.roleGrouped.servers).ctp, 300);

    // The two things that must never break: the night balances, and it can be saved.
    assert.equal(result.balances.overallBalance, 0);
    assert.deepEqual(settleGate(result).messages, []);
});

// THE OTHER CONTRACT: the "Supervisor" switch is access, never money.
//
// Supervisor rights live in their own field (users.isSupervisor) precisely so
// the pay maths never learns of them. The engine reads ROLE_POINTS by role and
// matches role === "captain" exactly to build the captain override, so had the
// switch been encoded as a role value - "captain-supervisor" and the like - a
// captain who lost their rights would reach a floor plan worth zero points and
// miss the override, and nothing would have said so.
//
// This walks a captain through both switch positions and the field being absent
// altogether, and demands the three shifts be indistinguishable.
test("the Supervisor switch changes no payout: a captain without it is still paid as a captain", () => {
    const shiftWithCaptainFlag = (captainMember) => calculateShift({
        teams: [
            {
                teamId: "team-1",
                members: [
                    { uid: "captain-1", name: "Captain One", role: "captain", ...captainMember },
                    { uid: "server-1", name: "Server One", role: "server" },
                    { uid: "back-1", name: "Back One", role: "back" },
                ],
                pools: { sales: 10000, tips: 1000, cash: 200, gratuity: 500 },
                contracts: [],
            },
        ],
        barTeam: { members: [], pools: {} },
        runners: [],
    });

    // The three ways the flag can reach the engine if it ever rode along on a
    // floor-plan member: off, on, and never written at all.
    const rightsOff = shiftWithCaptainFlag({ isSupervisor: false });
    const rightsOn = shiftWithCaptainFlag({ isSupervisor: true });
    const noFlagAtAll = shiftWithCaptainFlag({});

    const payoutsOf = (result) => {
        const { captains, servers, backs, assistants, bar } = result.payouts.roleGrouped;
        return [...captains, ...servers, ...backs, ...assistants, ...bar].map(
            ({ uid, role, points, ctp, grt, cash, total }) => ({ uid, role, points, ctp, grt, cash, total }),
        );
    };

    assert.deepEqual(payoutsOf(rightsOff), payoutsOf(rightsOn));
    assert.deepEqual(payoutsOf(rightsOff), payoutsOf(noFlagAtAll));
    assert.deepEqual(rightsOff.allocations, rightsOn.allocations);
    assert.deepEqual(rightsOff.balances, rightsOn.balances);

    // And spelled out on the person the switch is off for: full captain weight,
    // and the captain override still lands on them.
    const captain = getOnly(rightsOff.payouts.roleGrouped.captains);
    assert.equal(captain.uid, "captain-1");
    assert.equal(captain.points, 4);
    assert.equal(rightsOff.allocations.captainOverrideCTP, 100);
    assert.ok(captain.ctp > getOnly(rightsOff.payouts.roleGrouped.servers).ctp);
    assert.equal(rightsOff.balances.overallBalance, 0);
});
