import assert from "node:assert/strict";
import test from "node:test";

import {
    buildTempStaffMergePlan,
    formatTempStaffMergeResultMessage,
    rewriteShiftForTempStaffMerge,
    shiftReferencesUid,
} from "./tempStaffMergePersistence.js";

const tempUser = {
    uid: "temp_server",
    name: "Temp Server",
    role: "server",
};

const realUser = {
    uid: "real_server",
    username: "real-server",
    firstName: "Real Server",
    lastName: "",
    role: "server",
};

function ledgerEntry(date, uid, data = {}) {
    return {
        date,
        data: {
            date,
            uid,
            name: uid === tempUser.uid ? tempUser.name : realUser.firstName,
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
    assert.equal(mergedEntry.name, realUser.firstName);
    assert.equal(mergedEntry.tips, 100);
    assert.equal(mergedEntry.source, "temp_staff_merge");
    assert.deepEqual(mergedEntry.mergedFromTempStaff, {
        uid: tempUser.uid,
        name: tempUser.name,
        role: tempUser.role,
    });

    const member = plan.shiftUpdates[0].data.teams[0].members[0];
    assert.equal(member.uid, realUser.uid);
    assert.equal(member.name, realUser.firstName);
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
        name: realUser.firstName,
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
                [realUser.uid]: { name: realUser.firstName, total: 600 },
            },
        })],
    });

    assert.equal(plan.canMerge, false);
    assert.deepEqual(plan.collisions, [{
        date: "2026-05-28",
        sources: ["legacy shift payout"],
    }]);
});

// An unsettled night carries no payouts and no ledger entry, so it is not a money
// date - but the temp profile is still standing on that floor plan. Leaving it there
// while deleting the profile is what paid a UID with no account behind it.
function unsettledShiftDoc(date) {
    return {
        date,
        data: {
            date,
            status: "setup",
            teams: [{
                teamId: "team-1",
                members: [
                    { uid: "other_uid", name: "Other", role: "captain", points: 4 },
                    { uid: tempUser.uid, name: tempUser.name, role: "server", points: 4 },
                ],
            }],
            barTeam: { members: [] },
            runners: [],
        },
    };
}

test("rewrites an unsettled shift that carries no payouts and reports it separately", () => {
    const plan = buildPlan({
        shiftDocs: [shiftDoc("2026-05-28"), unsettledShiftDoc("2026-06-01")],
    });

    assert.equal(plan.canMerge, true);
    // The money date set is untouched: an unsettled night moves no saved pay.
    assert.deepEqual(plan.migratedDates, ["2026-05-28"]);
    assert.equal(plan.ledgerWrites.length, 1);
    assert.deepEqual(plan.rosterOnlyShiftDates, ["2026-06-01"]);

    assert.deepEqual(plan.shiftUpdates.map(update => update.date), ["2026-05-28", "2026-06-01"]);
    const unsettledMembers = plan.shiftUpdates[1].data.teams[0].members;
    assert.equal(unsettledMembers[0].uid, "other_uid");
    assert.equal(unsettledMembers[1].uid, realUser.uid);
    assert.equal(unsettledMembers[1].name, realUser.firstName);
    assert.equal(shiftReferencesUid(plan.shiftUpdates[1].data, tempUser.uid), false);
});

test("a roster-only shift date never turns into a collision on its own", () => {
    // The target already holds saved pay on the unsettled night's date - which the
    // per-date rule only blocks when the TEMP profile also holds money there. It
    // does not, so the merge proceeds and the roster is still rewritten.
    const plan = buildPlan({
        targetLedgerEntries: [ledgerEntry("2026-06-01", realUser.uid)],
        shiftDocs: [shiftDoc("2026-05-28"), unsettledShiftDoc("2026-06-01")],
    });

    assert.equal(plan.canMerge, true);
    assert.deepEqual(plan.collisions, []);
    assert.deepEqual(plan.migratedDates, ["2026-05-28"]);
    assert.deepEqual(plan.rosterOnlyShiftDates, ["2026-06-01"]);
});

test("a shift with no reference to the temp profile is not rewritten", () => {
    const plan = buildPlan({
        shiftDocs: [shiftDoc("2026-05-28"), {
            date: "2026-06-01",
            data: {
                date: "2026-06-01",
                status: "setup",
                teams: [{ teamId: "team-1", members: [{ uid: "other_uid", name: "Other", role: "server" }] }],
                barTeam: { members: [] },
                runners: [],
            },
        }],
    });

    assert.deepEqual(plan.shiftUpdates.map(update => update.date), ["2026-05-28"]);
    assert.deepEqual(plan.rosterOnlyShiftDates, []);
});

test("finds the temp profile wherever a shift can name it", () => {
    const tempUid = tempUser.uid;

    assert.equal(shiftReferencesUid({ teams: [{ members: [{ uid: tempUid }] }] }, tempUid), true);
    assert.equal(shiftReferencesUid({ barTeam: { members: [{ uid: tempUid }] } }, tempUid), true);
    assert.equal(shiftReferencesUid({ runners: [{ uid: tempUid }] }, tempUid), true);
    assert.equal(shiftReferencesUid({ payouts: { [tempUid]: { total: 10 } } }, tempUid), true);
    assert.equal(shiftReferencesUid({ teams: [{ members: [{ uid: "other" }] }] }, tempUid), false);
    assert.equal(shiftReferencesUid(null, tempUid), false);
});

test("the merge message reports what actually moved, not an unconditional success", () => {
    const moved = formatTempStaffMergeResultMessage({
        realUser,
        migratedDates: ["2026-05-28"],
        rosterOnlyShiftDates: ["2026-06-01"],
    });
    assert.match(moved, /merged into Real Server/);
    assert.match(moved, /Payout history moved: 2026-05-28\./);
    assert.match(moved, /Floor plan updated, with no payout saved yet: 2026-06-01\./);

    const rosterOnly = formatTempStaffMergeResultMessage({
        realUser,
        migratedDates: [],
        rosterOnlyShiftDates: ["2026-06-01"],
    });
    assert.match(rosterOnly, /No saved payout history to move\./);
    assert.match(rosterOnly, /2026-06-01/);
});

test("the merge message never claims success while a floor plan still names the deleted profile", () => {
    const message = formatTempStaffMergeResultMessage({
        realUser,
        migratedDates: ["2026-05-28"],
        rosterOnlyShiftDates: [],
        unresolvedShiftDates: ["2026-06-02"],
    });

    assert.match(message, /^Merge incomplete\./);
    assert.doesNotMatch(message, /merged into/);
    assert.match(message, /2026-06-02/);
    assert.match(message, /Real Server/);

    // The merge itself committed, so a failed re-check is reported as unverified
    // rather than as a failure - but it still tells the manager what to go and look at.
    const unverified = formatTempStaffMergeResultMessage({
        realUser,
        migratedDates: ["2026-05-28"],
        unresolvedShiftDatesUnknown: true,
    });
    assert.match(unverified, /merged into Real Server/);
    assert.match(unverified, /could not be re-checked/);
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
