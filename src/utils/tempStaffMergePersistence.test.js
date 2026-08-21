import assert from "node:assert/strict";
import test from "node:test";

import {
    buildTempStaffMergePlan,
    chunkTempStaffMergePlan,
    countTempStaffMergeWrites,
    formatTempStaffMergeCollisionMessage,
    formatTempStaffMergeResultMessage,
    isMergedFromThisTempStaff,
    isTempStaffMergeCollisionError,
    MERGE_DATES_PER_CHUNK,
    mergeTempStaffIntoAccount,
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

function isoDateFromOffset(offset) {
    const date = new Date(Date.UTC(2025, 0, 1 + offset));
    return date.toISOString().slice(0, 10);
}

function manyDates(count) {
    return Array.from({ length: count }, (_, index) => isoDateFromOffset(index));
}

test("a date already moved from this temp profile is a resume, not a collision", () => {
    const alreadyMoved = ledgerEntry("2026-05-28", realUser.uid, {
        tips: 100,
        gratuity: 25,
        total: 125,
        source: "temp_staff_merge",
        mergedFromTempStaff: {
            uid: tempUser.uid,
            name: tempUser.name,
            role: tempUser.role,
        },
    });
    const leftoverTemp = ledgerEntry("2026-05-28", tempUser.uid, {
        tips: 999,
        gratuity: 1,
        total: 1000,
    });
    const plan = buildPlan({
        tempLedgerEntries: [leftoverTemp],
        targetLedgerEntries: [alreadyMoved],
    });

    assert.equal(plan.canMerge, true);
    assert.deepEqual(plan.collisions, []);
    assert.deepEqual(plan.resumedDates, ["2026-05-28"]);
    assert.deepEqual(plan.ledgerWrites, []);
    assert.deepEqual(plan.ledgerDeletes, [{ date: "2026-05-28" }]);
    assert.equal(alreadyMoved.data.tips, 100);
    assert.equal(alreadyMoved.data.total, 125);
});

test("a real same-date collision still stops the whole plan when another date is only a resume", () => {
    const resumed = ledgerEntry("2026-05-27", realUser.uid, {
        mergedFromTempStaff: { uid: tempUser.uid, name: tempUser.name, role: tempUser.role },
    });
    const colliding = ledgerEntry("2026-05-28", realUser.uid, {
        tips: 500,
        source: "closeout",
    });
    const plan = buildPlan({
        tempLedgerEntries: [
            ledgerEntry("2026-05-27", tempUser.uid),
            ledgerEntry("2026-05-28", tempUser.uid),
            ledgerEntry("2026-05-29", tempUser.uid),
        ],
        targetLedgerEntries: [resumed, colliding],
        shiftDocs: [
            shiftDoc("2026-05-27"),
            shiftDoc("2026-05-28"),
            shiftDoc("2026-05-29"),
        ],
    });

    assert.equal(plan.canMerge, false);
    assert.deepEqual(plan.collisions, [{
        date: "2026-05-28",
        sources: ["canonical ledger"],
    }]);
    assert.deepEqual(plan.ledgerWrites, []);
    assert.deepEqual(plan.ledgerDeletes, []);
    assert.deepEqual(plan.shiftUpdates, []);
});

test("chunks a long history into proven 12-date pieces and keeps each piece under the write cap", () => {
    const dates = manyDates(50);
    const plan = buildPlan({
        tempLedgerEntries: dates.map(date => ledgerEntry(date, tempUser.uid)),
        shiftDocs: dates.map(date => shiftDoc(date)),
    });
    const chunks = chunkTempStaffMergePlan(plan);

    assert.equal(plan.migratedDates.length, 50);
    assert.ok(chunks.length > 1);
    assert.equal(chunks.length, Math.ceil(50 / MERGE_DATES_PER_CHUNK));
    assert.ok(chunks.every(chunk => chunk.dates.length <= MERGE_DATES_PER_CHUNK));
    assert.deepEqual(chunks.flatMap(chunk => chunk.dates), dates);
    chunks.forEach((chunk) => {
        assert.ok(countTempStaffMergeWrites(chunk) < 450);
    });
});

function createMergeHarness(initialStore = {}) {
    const store = { ...initialStore };
    const writes = [];
    const transactionCalls = [];

    const refs = {
        payoutEntry: (_db, date, uid) => ({ path: `payouts/${date}/entries/${uid}` }),
        payoutMeta: (_db, date) => ({ path: `payouts/${date}` }),
        legacyTip: (_db, uid, date) => ({ path: `users/${uid}/tips/${date}` }),
        shift: (_db, date) => ({ path: `shifts/${date}` }),
        user: (_db, uid) => ({ path: `users/${uid}` }),
        tempStaff: (_db, uid) => ({ path: `unregisteredStaff/${uid}` }),
        auditEvent: (_db, operationId) => ({ path: `auditEvents/${operationId}` }),
    };

    const snapshotOf = (ref) => ({
        exists: () => store[ref.path] != null,
        data: () => store[ref.path],
    });

    const readDoc = async (ref) => snapshotOf(ref);

    const runTransaction = async (_db, fn) => {
        const chunkWrites = [];
        const transaction = {
            get: async (ref) => snapshotOf(ref),
            set: (ref, data, options) => {
                store[ref.path] = options?.merge ? { ...store[ref.path], ...data } : { ...data };
                chunkWrites.push({ op: "set", path: ref.path });
            },
            update: (ref, data) => {
                store[ref.path] = { ...store[ref.path], ...data };
                chunkWrites.push({ op: "update", path: ref.path });
            },
            delete: (ref) => {
                delete store[ref.path];
                chunkWrites.push({ op: "delete", path: ref.path });
            },
        };
        const result = await fn(transaction);
        transactionCalls.push(chunkWrites);
        writes.push(...chunkWrites);
        return result;
    };

    return { store, refs, readDoc, runTransaction, writes, transactionCalls };
}

function seedLongHistory(store, { dates, includeTempProfile = true }) {
    if (includeTempProfile) {
        store[`unregisteredStaff/${tempUser.uid}`] = { ...tempUser };
    }
    store[`users/${realUser.uid}`] = { ...realUser, hasShiftHistory: false, hasTipHistory: false };
    dates.forEach((date) => {
        store[`payouts/${date}`] = { date, ledgerVersion: 1 };
        store[`payouts/${date}/entries/${tempUser.uid}`] = ledgerEntry(date, tempUser.uid).data;
        store[`shifts/${date}`] = shiftDoc(date).data;
    });
}

test("a 50-date history completes in pieces and deletes the temp profile only after the last piece", async () => {
    const dates = manyDates(50);
    const harness = createMergeHarness();
    seedLongHistory(harness.store, { dates });

    const progress = [];
    const result = await mergeTempStaffIntoAccount({
        db: {},
        tempUser,
        realUser,
        updatedBy: "adminUid",
        now: new Date("2026-05-30T02:00:00.000Z"),
        operationId: "temp-merge-long",
        refs: harness.refs,
        readDoc: harness.readDoc,
        runTransaction: harness.runTransaction,
        discoverLedgerEntries: async () => dates.map(date => ({
            date,
            data: harness.store[`payouts/${date}/entries/${tempUser.uid}`],
        })),
        discoverLegacyTips: async () => [],
        discoverUnsettledDates: async () => [],
        onProgress: (event) => progress.push(event),
    });

    assert.equal(result.migratedDates.length, 50);
    assert.equal(harness.store[`unregisteredStaff/${tempUser.uid}`], undefined);
    assert.equal(harness.store[`auditEvents/temp-merge-long`].type, "temp_staff_merged");
    assert.equal(harness.store[`users/${realUser.uid}`].hasTipHistory, true);

    dates.forEach((date) => {
        const moved = harness.store[`payouts/${date}/entries/${realUser.uid}`];
        assert.equal(moved.uid, realUser.uid);
        assert.equal(moved.tips, 100);
        assert.equal(moved.gratuity, 25);
        assert.equal(moved.total, 125);
        assert.equal(moved.name, realUser.firstName);
        assert.equal(moved.mergedFromTempStaff.uid, tempUser.uid);
        assert.equal(harness.store[`payouts/${date}/entries/${tempUser.uid}`], undefined);
        assert.equal(harness.store[`shifts/${date}`].teams[0].members[0].uid, realUser.uid);
    });

    const expectedChunks = Math.ceil(50 / MERGE_DATES_PER_CHUNK);
    assert.equal(harness.transactionCalls.length, expectedChunks + 1);
    harness.transactionCalls.slice(0, expectedChunks).forEach((chunkWrites) => {
        assert.ok(chunkWrites.length < 450);
        assert.ok(!chunkWrites.some(write => write.path === `unregisteredStaff/${tempUser.uid}`));
    });
    const finalizeWrites = harness.transactionCalls[expectedChunks];
    assert.ok(finalizeWrites.some(write => write.path === `unregisteredStaff/${tempUser.uid}` && write.op === "delete"));
    assert.ok(progress.length >= expectedChunks);
    assert.equal(progress.at(-1).completedDates, 50);
});

test("a same-date collision stops the live merge with no writes", async () => {
    const harness = createMergeHarness();
    seedLongHistory(harness.store, { dates: ["2026-05-28"] });
    harness.store[`payouts/2026-05-28/entries/${realUser.uid}`] = ledgerEntry("2026-05-28", realUser.uid, {
        tips: 500,
        gratuity: 100,
        total: 600,
        source: "closeout",
    }).data;
    const storeBefore = structuredClone(harness.store);

    await assert.rejects(
        () => mergeTempStaffIntoAccount({
            db: {},
            tempUser,
            realUser,
            updatedBy: "adminUid",
            refs: harness.refs,
            readDoc: harness.readDoc,
            runTransaction: harness.runTransaction,
            discoverLedgerEntries: async () => [{
                date: "2026-05-28",
                data: harness.store[`payouts/2026-05-28/entries/${tempUser.uid}`],
            }],
            discoverLegacyTips: async () => [],
            discoverUnsettledDates: async () => [],
        }),
        (error) => isTempStaffMergeCollisionError(error) && error.collisions[0].date === "2026-05-28"
    );

    assert.deepEqual(harness.writes, []);
    assert.deepEqual(harness.store, storeBefore);
});

test("a collision found after the first piece has committed reports the dates that already moved", async () => {
    const dates = Array.from({ length: 20 }, (_, index) => `2026-05-${String(index + 1).padStart(2, "0")}`);
    const clashingDate = dates[MERGE_DATES_PER_CHUNK];
    const harness = createMergeHarness();
    seedLongHistory(harness.store, { dates });

    let thrown = null;
    await assert.rejects(
        () => mergeTempStaffIntoAccount({
            db: {},
            tempUser,
            realUser,
            updatedBy: "adminUid",
            refs: harness.refs,
            readDoc: harness.readDoc,
            runTransaction: harness.runTransaction,
            discoverLedgerEntries: async () => dates.map(date => ({
                date,
                data: harness.store[`payouts/${date}/entries/${tempUser.uid}`],
            })),
            discoverLegacyTips: async () => [],
            discoverUnsettledDates: async () => [],
            // The clash appears between pieces: a captain settles that night for the real
            // account while the merge is still running.
            onProgress: ({ completedChunks }) => {
                if (completedChunks === 1) {
                    harness.store[`payouts/${clashingDate}/entries/${realUser.uid}`] = ledgerEntry(clashingDate, realUser.uid, {
                        source: "closeout",
                    }).data;
                }
            },
        }),
        (error) => {
            thrown = error;
            return isTempStaffMergeCollisionError(error);
        }
    );

    assert.deepEqual(thrown.movedDates, dates.slice(0, MERGE_DATES_PER_CHUNK));
    assert.equal(thrown.collisions[0].date, clashingDate);
    assert.ok(harness.store[`unregisteredStaff/${tempUser.uid}`], "the temp profile survives a stopped merge");

    const message = formatTempStaffMergeCollisionMessage(thrown.collisions, thrown.movedDates);
    assert.ok(!message.includes("No records were changed"));
    assert.ok(message.includes(dates[0]));
    assert.ok(message.includes(clashingDate));
});

test("a collision found before any write still says nothing changed", () => {
    const message = formatTempStaffMergeCollisionMessage([{ date: "2026-05-28" }], []);
    assert.ok(message.includes("No records were changed"));
    assert.ok(message.includes("2026-05-28"));
});

test("a retry after a partial success finishes the remaining dates and does not overwrite", async () => {
    const movedDate = "2026-05-27";
    const remainingDate = "2026-05-28";
    const harness = createMergeHarness();
    seedLongHistory(harness.store, { dates: [movedDate, remainingDate] });

    // First click got as far as writing this date onto the real account. The leftover
    // temp entry is still there - the shape a retry sees after a partial success.
    harness.store[`payouts/${movedDate}/entries/${realUser.uid}`] = {
        ...ledgerEntry(movedDate, realUser.uid, {
            tips: 100,
            gratuity: 25,
            total: 125,
            source: "temp_staff_merge",
        }).data,
        mergedFromTempStaff: {
            uid: tempUser.uid,
            name: tempUser.name,
            role: tempUser.role,
        },
        keepThis: true,
    };
    harness.store[`payouts/${movedDate}/entries/${tempUser.uid}`] = ledgerEntry(movedDate, tempUser.uid, {
        tips: 999,
        gratuity: 1,
        total: 1000,
    }).data;

    const result = await mergeTempStaffIntoAccount({
        db: {},
        tempUser,
        realUser,
        updatedBy: "adminUid",
        now: new Date("2026-05-30T02:00:00.000Z"),
        operationId: "temp-merge-retry",
        refs: harness.refs,
        readDoc: harness.readDoc,
        runTransaction: harness.runTransaction,
        discoverLedgerEntries: async () => [movedDate, remainingDate].map(date => ({
            date,
            data: harness.store[`payouts/${date}/entries/${tempUser.uid}`],
        })),
        discoverLegacyTips: async () => [],
        discoverUnsettledDates: async () => [],
    });

    assert.deepEqual(result.migratedDates, [movedDate, remainingDate]);

    const alreadyMoved = harness.store[`payouts/${movedDate}/entries/${realUser.uid}`];
    assert.equal(alreadyMoved.tips, 100);
    assert.equal(alreadyMoved.keepThis, true);
    assert.equal(alreadyMoved.total, 125);
    assert.equal(harness.store[`payouts/${movedDate}/entries/${tempUser.uid}`], undefined);

    const newlyMoved = harness.store[`payouts/${remainingDate}/entries/${realUser.uid}`];
    assert.equal(newlyMoved.uid, realUser.uid);
    assert.equal(newlyMoved.tips, 100);
    assert.equal(newlyMoved.mergedFromTempStaff.uid, tempUser.uid);
    assert.equal(harness.store[`payouts/${remainingDate}/entries/${tempUser.uid}`], undefined);

    assert.equal(harness.store[`unregisteredStaff/${tempUser.uid}`], undefined);
    assert.equal(
        harness.writes.filter(write => write.path === `payouts/${movedDate}/entries/${realUser.uid}` && write.op === "set").length,
        0
    );
});

test("isMergedFromThisTempStaff only matches this temp profile", () => {
    assert.equal(isMergedFromThisTempStaff({ mergedFromTempStaff: { uid: tempUser.uid } }, tempUser.uid), true);
    assert.equal(isMergedFromThisTempStaff({ mergedFromTempStaff: { uid: "someone_else" } }, tempUser.uid), false);
    assert.equal(isMergedFromThisTempStaff({ source: "closeout" }, tempUser.uid), false);
});
