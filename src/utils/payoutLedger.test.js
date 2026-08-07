import assert from "node:assert/strict";
import test from "node:test";

import {
    attachLedgerPayoutsToSummary,
    getLedgerStaffTotal,
    reconcilePayoutLedger,
} from "./payoutLedger.js";

const balancedSummary = {
    allocations: {
        doorCTPAllocation: 8,
        doorGRTAllocation: 6,
        peCoordinatorGRT: 4,
        houseAllocation: 2,
    },
    balances: {
        totalAvailable: 220,
        totalDistributed: 220,
        overallBalance: 0,
    },
};

const balancedEntries = [
    {
        uid: "serverUid",
        date: "2026-05-29",
        name: "Server One",
        role: "server",
        tips: 100,
        gratuity: 50,
        cash: 30,
        total: 180,
    },
    {
        uid: "runnerUid",
        date: "2026-05-29",
        name: "Runner One",
        role: "runner",
        tips: 20,
        gratuity: 0,
        cash: 0,
        total: 20,
        payoutAmount: 20,
    },
];

test("totals canonical ledger staff payouts from canonical total fields", () => {
    assert.equal(getLedgerStaffTotal(balancedEntries), 200);
});

test("reconciles canonical ledger entries against available and distributed money", () => {
    const result = reconcilePayoutLedger({
        summary: balancedSummary,
        entries: balancedEntries,
    });

    assert.equal(result.ok, true);
    assert.equal(result.externalFees, 20);
    assert.equal(result.expectedStaffTotal, 200);
    assert.equal(result.ledgerStaffTotal, 200);
    assert.equal(result.ledgerStaffBalance, 0);
});

test("reports drift when engine balances or ledger totals do not reconcile", () => {
    const result = reconcilePayoutLedger({
        summary: {
            ...balancedSummary,
            balances: {
                totalAvailable: 225,
                totalDistributed: 220,
                overallBalance: 5,
            },
        },
        entries: balancedEntries.slice(0, 1),
    });

    assert.equal(result.ok, false);
    assert.equal(result.overallBalance, 5);
    assert.equal(result.ledgerStaffBalance, 20);
    assert.equal(result.messages.length, 2);
});

test("attached admin summary includes read-side reconciliation state", () => {
    const attached = attachLedgerPayoutsToSummary(balancedSummary, balancedEntries);

    assert.equal(attached.payoutReconciliation.ok, true);
    assert.equal(attached.payouts.roleGrouped.servers.length, 1);
    assert.equal(attached.payouts.roleGrouped.runners.length, 1);
});
