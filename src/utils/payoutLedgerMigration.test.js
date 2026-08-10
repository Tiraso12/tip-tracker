import assert from "node:assert/strict";
import test from "node:test";

import {
    buildCanonicalPayoutLedgerMigration,
    payoutAmountsMatch,
    planPayoutLedgerWrites,
} from "./payoutLedgerMigration.js";

test("payoutAmountsMatch: equal money but differing points weight is a MATCH", () => {
    // The users/{uid}/tips mirror stores points: 0 while the shift payout carries
    // the real distribution weight. Same dollars paid => not a conflict.
    const shift = { tips: 100, gratuity: 25, cash: 10, wineBonus: 0, points: 2.5, total: 125 };
    const tip = { tips: 100, gratuity: 25, cash: 10, wineBonus: 0, points: 0, total: 125 };

    assert.equal(payoutAmountsMatch(shift, tip), true);
});

test("payoutAmountsMatch: derived total off by a rounding cent is a MATCH", () => {
    // Real prod shape: shift stores a rounded total, the tip mirror stores raw
    // tips + gratuity, so total differs by exactly one cent. Note 531.44 - 531.43
    // is 0.01000000000000477 in float, so a naive epsilon check would fail here.
    const shift = { tips: 287.73, gratuity: 243.71, cash: 0, wineBonus: 0, points: 4, total: 531.43 };
    const tip = { tips: 287.73, gratuity: 243.71, cash: 0, wineBonus: 0, points: 0, total: 531.44 };

    assert.equal(payoutAmountsMatch(shift, tip), true);
});

test("payoutAmountsMatch: a derived total off by two cents is still a CONFLICT", () => {
    const shift = { tips: 100, gratuity: 25, cash: 10, wineBonus: 0, points: 2, total: 135.00 };
    const tip = { tips: 100, gratuity: 25, cash: 10, wineBonus: 0, points: 0, total: 135.02 };

    assert.equal(payoutAmountsMatch(shift, tip), false);
});

test("payoutAmountsMatch: a genuine dollar difference in money fields is a CONFLICT", () => {
    const shift = { tips: 100, gratuity: 25, cash: 10, wineBonus: 0, points: 2, total: 135 };
    const tipDollarMore = { tips: 110, gratuity: 25, cash: 10, wineBonus: 0, points: 2, total: 135 };
    assert.equal(payoutAmountsMatch(shift, tipDollarMore), false);

    const tipGratuity = { ...shift, gratuity: 30 };
    assert.equal(payoutAmountsMatch(shift, tipGratuity), false);

    const tipCash = { ...shift, cash: 12 };
    assert.equal(payoutAmountsMatch(shift, tipCash), false);
});

test("builds canonical ledger entries from matching legacy shift and tip data", () => {
    const migration = buildCanonicalPayoutLedgerMigration({
        shifts: [{
            id: "2026-05-29",
            data: {
                date: "2026-05-29",
                payouts: {
                    serverUid: {
                        name: "Server One",
                        role: "server",
                        tips: 100,
                        gratuity: 25,
                        cash: 10,
                        wineBonus: 0,
                        points: 2,
                        total: 125,
                    },
                    shiftOnlyUid: {
                        name: "Shift Only",
                        role: "back",
                        tips: 50,
                        gratuity: 10,
                        cash: 5,
                        total: 60,
                    },
                },
            },
        }],
        tips: [
            {
                uid: "serverUid",
                date: "2026-05-29",
                data: {
                    role: "server",
                    tip: 100,
                    gratuity: 25,
                    cash: 10,
                    wineBonus: 0,
                    points: 2,
                    total: 125,
                },
            },
            {
                uid: "tipOnlyUid",
                date: "2026-05-30",
                data: {
                    role: "runner",
                    tip: 85,
                    gratuity: 0,
                    cash: 0,
                    total: 85,
                },
            },
        ],
    });

    assert.equal(migration.conflicts.length, 0);
    assert.deepEqual(migration.counts, {
        shiftPayouts: 2,
        tipPayouts: 2,
        canonicalEntries: 3,
        conflicts: 0,
    });

    const serverEntry = migration.entries.find((entry) => entry.uid === "serverUid");
    assert.equal(serverEntry.name, "Server One");
    assert.equal(serverEntry.tips, 100);
    assert.deepEqual(serverEntry.sources, ["shift", "tip"]);

    const tipOnlyEntry = migration.entries.find((entry) => entry.uid === "tipOnlyUid");
    assert.equal(tipOnlyEntry.date, "2026-05-30");
    assert.equal(tipOnlyEntry.role, "runner");
    assert.equal(tipOnlyEntry.total, 85);
});

test("reports conflicts instead of choosing between mismatched legacy amounts", () => {
    const migration = buildCanonicalPayoutLedgerMigration({
        shifts: [{
            id: "2026-05-29",
            data: {
                payouts: {
                    serverUid: {
                        role: "server",
                        tips: 100,
                        gratuity: 25,
                        cash: 10,
                        total: 125,
                    },
                },
            },
        }],
        tips: [{
            uid: "serverUid",
            date: "2026-05-29",
            data: {
                role: "server",
                tip: 101,
                gratuity: 25,
                cash: 10,
                total: 126,
            },
        }],
    });

    assert.equal(migration.entries.length, 1);
    assert.equal(migration.conflicts.length, 1);
    assert.equal(migration.conflicts[0].date, "2026-05-29");
    assert.equal(migration.conflicts[0].uid, "serverUid");
});

test("plans only missing ledger writes and is idempotent after entries exist", () => {
    const desiredEntries = [{
        date: "2026-05-29",
        uid: "serverUid",
        name: "Server One",
        role: "server",
        tips: 100,
        gratuity: 25,
        cash: 10,
        wineBonus: 0,
        points: 2,
        total: 125,
    }];

    const firstPlan = planPayoutLedgerWrites({
        desiredEntries,
        existingEntries: [],
        operationId: "migration-one",
        updatedAt: "2026-06-01T00:00:00.000Z",
    });

    assert.equal(firstPlan.writes.length, 1);
    assert.equal(firstPlan.skipped.length, 0);
    assert.equal(firstPlan.conflicts.length, 0);
    assert.equal(firstPlan.writes[0].data.source, "migration");

    const secondPlan = planPayoutLedgerWrites({
        desiredEntries,
        existingEntries: firstPlan.writes.map((write) => write.data),
        operationId: "migration-two",
        updatedAt: "2026-06-02T00:00:00.000Z",
    });

    assert.equal(secondPlan.writes.length, 0);
    assert.equal(secondPlan.skipped.length, 1);
    assert.equal(secondPlan.conflicts.length, 0);
});
