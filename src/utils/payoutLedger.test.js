import assert from "node:assert/strict";
import test from "node:test";

import {
    attachLedgerPayoutsToSummary,
    buildPayoutLedgerEntry,
    getLedgerStaffCash,
    getLedgerStaffTotal,
    ledgerEntriesToPayoutMap,
    ledgerEntryToEmployeeData,
    reconcilePayoutLedger,
} from "./payoutLedger.js";

// 220 distributed = 20 external fees + 170 staff CTP/GRT + 30 staff cash.
const balancedSummary = {
    allocations: {
        doorCTPAllocation: 8,
        doorGRTAllocation: 6,
        peCoordinatorGRT: 4,
        houseAllocation: 2,
    },
    adjustedPools: {
        adjustedTeamCashPool: 30,
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
        total: 150,
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

test("ledger staff total is CTP + GRT and never includes cash", () => {
    assert.equal(getLedgerStaffTotal(balancedEntries), 170);
    assert.equal(getLedgerStaffCash(balancedEntries), 30);
});

test("reconciles canonical ledger entries with cash accounted for separately", () => {
    const result = reconcilePayoutLedger({
        summary: balancedSummary,
        entries: balancedEntries,
    });

    assert.equal(result.ok, true);
    assert.equal(result.externalFees, 20);
    // All staff money, cash included - the old cash-inclusive figure.
    assert.equal(result.expectedStaffPayout, 200);
    // Which now splits explicitly into non-cash and cash sides.
    assert.equal(result.expectedStaffTotal, 170);
    assert.equal(result.expectedStaffCash, 30);
    assert.equal(result.ledgerStaffTotal, 170);
    assert.equal(result.ledgerStaffCash, 30);
    assert.equal(result.ledgerStaffBalance, 0);
    assert.equal(result.ledgerCashBalance, 0);
    // The books still close: non-cash + cash back to every staff dollar distributed.
    assert.equal(result.ledgerStaffTotal + result.ledgerStaffCash, result.expectedStaffPayout);
});

test("reconciles ledger docs written under the old cash-inclusive total rule", () => {
    // Pre-existing production docs store total = CTP + GRT + cash for dining
    // staff. Totals are re-derived on read, so those docs reconcile unchanged -
    // no data backfill is needed to make the books balance.
    const legacyEntries = balancedEntries.map((entry) => (
        entry.cash > 0 ? { ...entry, total: entry.total + entry.cash } : entry
    ));

    const result = reconcilePayoutLedger({
        summary: balancedSummary,
        entries: legacyEntries,
    });

    assert.equal(result.ok, true);
    assert.equal(result.ledgerStaffTotal, 170);
    assert.equal(result.ledgerStaffCash, 30);
});

test("reports cash drift separately from non-cash drift", () => {
    const result = reconcilePayoutLedger({
        summary: {
            ...balancedSummary,
            adjustedPools: { adjustedTeamCashPool: 45 },
        },
        entries: balancedEntries,
    });

    assert.equal(result.ok, false);
    assert.equal(result.expectedStaffCash, 45);
    assert.equal(result.ledgerStaffCash, 30);
    assert.equal(result.ledgerCashBalance, 15);
    assert.equal(result.messages.length, 2);
    assert.match(result.messages.join(" "), /cash does not reconcile/);
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
    // 200 distributed to staff - 30 cash - 150 non-cash on the one entry left.
    assert.equal(result.ledgerStaffBalance, 20);
    assert.equal(result.messages.length, 2);
});

test("falls back to the ledger's own cash when the summary carries no cash pool", () => {
    const { adjustedPools: _unused, ...summaryWithoutPools } = balancedSummary;

    const result = reconcilePayoutLedger({
        summary: summaryWithoutPools,
        entries: balancedEntries,
    });

    // Nothing independent to check cash against, but the combined invariant
    // still holds, so an otherwise sound shift must not be flagged.
    assert.equal(result.ok, true);
    assert.equal(result.expectedStaffCash, 30);
});

test("stored entry total is derived, never passed through from the caller", () => {
    const entry = buildPayoutLedgerEntry({
        date: "2026-05-29",
        uid: "serverUid",
        // A cash-inclusive total from an old engine build or a legacy doc.
        payout: { name: "Server One", role: "server", tips: 100, gratuity: 50, cash: 30, total: 180 },
        operationId: "op",
        updatedAt: "2026-05-29T00:00:00.000Z",
    });

    assert.equal(entry.total, 150);
    assert.equal(entry.cash, 30);
});

test("read shapes report CTP + GRT totals with cash alongside", () => {
    const legacyEntry = { ...balancedEntries[0], total: 180 };

    assert.equal(ledgerEntryToEmployeeData(legacyEntry).total, 150);
    assert.equal(ledgerEntryToEmployeeData(legacyEntry).cash, 30);
    assert.equal(ledgerEntriesToPayoutMap([legacyEntry]).serverUid.total, 150);
    assert.equal(ledgerEntriesToPayoutMap([legacyEntry]).serverUid.cash, 30);
});

test("attached admin summary includes read-side reconciliation state", () => {
    const attached = attachLedgerPayoutsToSummary(balancedSummary, balancedEntries);

    assert.equal(attached.payoutReconciliation.ok, true);
    assert.equal(attached.payouts.roleGrouped.servers.length, 1);
    assert.equal(attached.payouts.roleGrouped.servers[0].total, 150);
    assert.equal(attached.payouts.roleGrouped.servers[0].cash, 30);
    assert.equal(attached.payouts.roleGrouped.runners.length, 1);
});
