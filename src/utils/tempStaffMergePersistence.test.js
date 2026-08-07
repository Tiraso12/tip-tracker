import assert from "node:assert/strict";
import test from "node:test";

import {
    buildTempStaffMergePlan,
    rewriteShiftForTempStaffMerge,
} from "./tempStaffMergePersistence.js";

const tempUser = {
    uid: "temp_server",
    name: "Temp Server",
    role: "server",
};

const realUser = {
    uid: "real_server",
    username: "Real Server",
    role: "server",
};

function ledgerEntry(date, uid, data = {}) {
    return {
        date,
        data: {
            date,
            uid,
            name: uid === tempUser.uid ? tempUser.name : realUser.username,
            role: "server",
            tips: 100,
            gratuity: 25,
            cash: 10,
            total: 125,
            ...data,
        },
    };
}

function shiftDoc(date, data = {}) {
    return {
        date,
        data: {
            date,
            status: "closed",
            teams: [{
                teamId: "team-1",
                members: [{ uid: tempUser.uid, name: tempUser.name, role: "server" }],
            }],
            barTeam: { members: [] },
            runners: [],
            ...data,
        },
    };
}

function buildPlan(overrides = {}) {
    return buildTempStaffMergePlan({
        tempUser,
        realUser,
        tempLedgerEntries: [ledgerEntry("2026-05-28", tempUser.uid)],
        targetLedgerEntries: [],
        tempLegacyTips: [],
        targetLegacyTips: [],
        shiftDocs: [shiftDoc("2026-05-28")],
        operationId: "temp-merge-operation",
        updatedAt: "2026-05-30T02:00:00.000Z",
        updatedBy: "adminUid",
        ...overrides,
    });
}

test("plans a clean temp-staff merge into an empty target account", () => {
    const plan = buildPlan();

    assert.equal(plan.canMerge, true);
    assert.deepEqual(plan.migratedDates, ["2026-05-28"]);
    assert.deepEqual(plan.collisions, []);
    assert.equal(plan.ledgerWrites.length, 1);
    assert.equal(plan.ledgerDeletes.length, 1);
    assert.equal(plan.shiftUpdates.length, 1);

    const mergedEntry = plan.ledgerWrites[0].data;
    assert.equal(mergedEntry.uid, realUser.uid);
    assert.equal(mergedEntry.name, realUser.username);
    assert.equal(mergedEntry.tips, 100);
    assert.equal(mergedEntry.source, "temp_staff_merge");
    assert.deepEqual(mergedEntry.mergedFromTempStaff, {
        uid: tempUser.uid,
        name: tempUser.name,
        role: tempUser.role,
    });

    const member = plan.shiftUpdates[0].data.teams[0].members[0];
    assert.equal(member.uid, realUser.uid);
    assert.equal(member.name, realUser.username);
    assert.deepEqual(member.mergedFromTempStaff, {
        uid: tempUser.uid,
        name: tempUser.name,
        role: tempUser.role,
    });
});

test("allows merge into a non-empty target account when dates do not collide", () => {
    const existingTargetPayout = ledgerEntry("2026-05-29", realUser.uid, {
        tips: 220,
        gratuity: 55,
        total: 275,
    });
    const plan = buildPlan({
        targetLedgerEntries: [existingTargetPayout],
    });

    assert.equal(plan.canMerge, true);
    assert.deepEqual(plan.migratedDates, ["2026-05-28"]);
    assert.deepEqual(plan.collisions, []);
    assert.equal(plan.ledgerWrites.length, 1);
    assert.equal(plan.ledgerWrites[0].date, "2026-05-28");
    assert.deepEqual(existingTargetPayout.data, {
        date: "2026-05-29",
        uid: realUser.uid,
        name: realUser.username,
        role: "server",
        tips: 220,
        gratuity: 55,
        cash: 10,
        total: 275,
    });
});

test("reports same-date collisions and plans no writes that could overwrite the target payout", () => {
    const targetPayoutBefore = ledgerEntry("2026-05-28", realUser.uid, {
        tips: 500,
        gratuity: 100,
        total: 600,
    });
    const plan = buildPlan({
        targetLedgerEntries: [targetPayoutBefore],
    });

    assert.equal(plan.canMerge, false);
    assert.deepEqual(plan.collisions, [{
        date: "2026-05-28",
        sources: ["canonical ledger"],
    }]);
    assert.deepEqual(plan.migratedDates, []);
    assert.deepEqual(plan.ledgerWrites, []);
    assert.deepEqual(plan.ledgerDeletes, []);
    assert.deepEqual(plan.legacyTipWrites, []);
    assert.deepEqual(plan.legacyTipDeletes, []);
    assert.deepEqual(plan.shiftUpdates, []);
    assert.equal(targetPayoutBefore.data.total, 600);
});

test("legacy shift payout collisions are detected before rewriting historical payout maps", () => {
    const plan = buildPlan({
        targetLedgerEntries: [],
        shiftDocs: [shiftDoc("2026-05-28", {
            payouts: {
                [tempUser.uid]: { name: tempUser.name, total: 125 },
                [realUser.uid]: { name: realUser.username, total: 600 },
            },
        })],
    });

    assert.equal(plan.canMerge, false);
    assert.deepEqual(plan.collisions, [{
        date: "2026-05-28",
        sources: ["legacy shift payout"],
    }]);
});

test("rewrites only temp staff identity fields in a shift snapshot", () => {
    const before = {
        date: "2026-05-28",
        teams: [{
            teamId: "team-1",
            members: [
                { uid: tempUser.uid, name: tempUser.name, role: "server" },
                { uid: "other_uid", name: "Other", role: "back" },
            ],
        }],
        barTeam: { members: [] },
        runners: [],
    };

    const result = rewriteShiftForTempStaffMerge(before, {
        tempUser,
        realUser,
        operationId: "temp-merge-operation",
        updatedAt: "2026-05-30T02:00:00.000Z",
    });

    assert.equal(result.modified, true);
    assert.equal(result.data.teams[0].members[0].uid, realUser.uid);
    assert.equal(result.data.teams[0].members[1].uid, "other_uid");
    assert.equal(before.teams[0].members[0].uid, tempUser.uid);
});
