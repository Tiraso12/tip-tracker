import assert from "node:assert/strict";
import test from "node:test";

import { saveClosedShiftAtomically, removeShiftAtomically } from "./closeoutPersistence.js";

const ref = (path) => ({ path });

const fakeRefs = {
    shift: (_db, date) => ref(`shifts/${date}`),
    payoutMeta: (_db, date) => ref(`payouts/${date}`),
    payoutEntry: (_db, date, uid) => ref(`payouts/${date}/entries/${uid}`),
    user: (_db, uid) => ref(`users/${uid}`),
    auditEvent: (_db, operationId) => ref(`auditEvents/${operationId}`),
};

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function snapshot(data) {
    return {
        exists: () => data !== undefined,
        data: () => clone(data),
    };
}

class FakeStore {
    constructor(initialDocs = {}) {
        this.docs = new Map(Object.entries(initialDocs).map(([path, data]) => [path, clone(data)]));
    }

    get(path) {
        return clone(this.docs.get(path));
    }

    set(path, data) {
        this.docs.set(path, clone(data));
    }

    delete(path) {
        this.docs.delete(path);
    }

    has(path) {
        return this.docs.has(path);
    }

    payoutEntries(date) {
        const prefix = `payouts/${date}/entries/`;
        return Array.from(this.docs.entries())
            .filter(([path]) => path.startsWith(prefix))
            .map(([path, data]) => ({
                uid: path.slice(prefix.length),
                ...clone(data),
            }));
    }
}

class FakeBatch {
    constructor(store, { failCommit = false } = {}) {
        this.store = store;
        this.failCommit = failCommit;
        this.ops = [];
    }

    set(docRef, data, options) {
        this.ops.push({ type: "set", path: docRef.path, data: clone(data), options });
    }

    update(docRef, data) {
        this.ops.push({ type: "update", path: docRef.path, data: clone(data) });
    }

    delete(docRef) {
        this.ops.push({ type: "delete", path: docRef.path });
    }

    async commit() {
        if (this.failCommit) {
            throw new Error("commit failed");
        }

        this.ops.forEach((op) => {
            if (op.type === "update" && !this.store.has(op.path)) {
                throw new Error(`missing document for update: ${op.path}`);
            }
        });

        const nextDocs = new Map(Array.from(this.store.docs.entries()).map(([path, data]) => [path, clone(data)]));
        this.ops.forEach((op) => {
            if (op.type === "set") {
                const existing = op.options?.merge ? nextDocs.get(op.path) || {} : {};
                nextDocs.set(op.path, { ...clone(existing), ...clone(op.data) });
                return;
            }
            if (op.type === "update") {
                nextDocs.set(op.path, { ...clone(nextDocs.get(op.path)), ...clone(op.data) });
                return;
            }
            if (op.type === "delete") {
                nextDocs.delete(op.path);
            }
        });
        this.store.docs = nextDocs;
    }
}

function removeWithFakeStore(store, options = {}) {
    return removeShiftAtomically({
        db: {},
        date: "2026-05-29",
        updatedBy: "adminUid",
        now: "2026-05-30T02:00:00.000Z",
        operationId: "removal-operation",
        refs: fakeRefs,
        batchFactory: () => new FakeBatch(store, options.batchOptions),
        readShift: async (shiftRef) => snapshot(store.get(shiftRef.path)),
        readPayoutEntries: async () => store.payoutEntries("2026-05-29"),
    });
}

function saveWithFakeStore(store, options = {}) {
    return saveClosedShiftAtomically({
        db: {},
        date: "2026-05-29",
        teams: [{
            teamId: "team-1",
            members: [{ uid: "serverUid", name: "Server One", role: "server", points: 1 }],
            pools: {},
        }],
        barTeam: { members: [], pools: {} },
        runners: [],
        payouts: {
            serverUid: {
                name: "Server One",
                role: "server",
                tips: 120,
                gratuity: 40,
                cash: 20,
                total: 180,
            },
        },
        summary: {
            allocations: {
                doorCTPAllocation: 0,
                doorGRTAllocation: 0,
                peCoordinatorGRT: 0,
                houseAllocation: 0,
            },
            balances: {
                totalAvailable: 180,
                totalDistributed: 180,
                overallBalance: 0,
            },
            payouts: { roleGrouped: { servers: [{ uid: "serverUid", total: 180 }] } },
        },
        realEmployeeUids: new Set(["serverUid"]),
        updatedBy: "adminUid",
        now: "2026-05-30T02:00:00.000Z",
        operationId: "closeout-operation",
        refs: fakeRefs,
        batchFactory: () => new FakeBatch(store, options.batchOptions),
        readShift: async (shiftRef) => snapshot(store.get(shiftRef.path)),
        readPayoutEntries: async () => store.payoutEntries("2026-05-29"),
    });
}

test("saves closed shift, canonical ledger, removed cleanup, flags, and audit in one batch", async () => {
    const store = new FakeStore({
        "shifts/2026-05-29": {
            status: "closed",
            firstClosedAt: "2026-05-29T04:00:00.000Z",
            closedAt: "2026-05-29T04:00:00.000Z",
        },
        "payouts/2026-05-29/entries/removedUid": {
            uid: "removedUid",
            date: "2026-05-29",
            tips: 90,
            gratuity: 10,
            cash: 5,
            total: 100,
        },
        "users/serverUid": { uid: "serverUid", role: "server", status: "active" },
    });

    const result = await saveWithFakeStore(store);

    assert.equal(result.operationId, "closeout-operation");
    assert.equal(store.get("payouts/2026-05-29/entries/removedUid"), undefined);

    const shift = store.get("shifts/2026-05-29");
    assert.equal(shift.status, "closed");
    assert.equal(shift.firstClosedAt, "2026-05-29T04:00:00.000Z");
    assert.equal(shift.closedAt, "2026-05-29T04:00:00.000Z");
    assert.equal(shift.lastRecalculatedAt, "2026-05-30T02:00:00.000Z");
    assert.equal(shift.updatedBy, "adminUid");
    assert.equal("payouts" in shift, false);
    assert.equal("payouts" in shift.summary, false);

    const payout = store.get("payouts/2026-05-29/entries/serverUid");
    assert.equal(payout.uid, "serverUid");
    assert.equal(payout.tips, 120);
    assert.equal(payout.operationId, "closeout-operation");

    assert.deepEqual(store.get("users/serverUid"), {
        uid: "serverUid",
        role: "server",
        status: "active",
        hasShiftHistory: true,
        hasTipHistory: true,
    });

    const audit = store.get("auditEvents/closeout-operation");
    assert.equal(audit.type, "shift_recalculated");
    assert.deepEqual(audit.previousPayoutUids, ["removedUid"]);
    assert.deepEqual(audit.nextPayoutUids, ["serverUid"]);
    assert.deepEqual(audit.removedPayoutUids, ["removedUid"]);
    assert.equal(result.payoutReconciliation.ok, true);
});

test("failed batch commit leaves all money state unchanged", async () => {
    const store = new FakeStore({
        "shifts/2026-05-29": {
            status: "closed",
            firstClosedAt: "2026-05-29T04:00:00.000Z",
            summary: { balances: { overallBalance: 3 } },
        },
        "payouts/2026-05-29/entries/removedUid": {
            uid: "removedUid",
            date: "2026-05-29",
            tips: 90,
            gratuity: 10,
            cash: 5,
            total: 100,
        },
        "users/serverUid": { uid: "serverUid", role: "server", status: "active" },
    });
    const before = clone(Object.fromEntries(store.docs));

    await assert.rejects(
        () => saveWithFakeStore(store, { batchOptions: { failCommit: true } }),
        /commit failed/
    );

    assert.deepEqual(Object.fromEntries(store.docs), before);
});

test("missing history flag update rejects the batch before payout state changes", async () => {
    const store = new FakeStore({
        "shifts/2026-05-29": { status: "setup" },
        "payouts/2026-05-29/entries/removedUid": {
            uid: "removedUid",
            date: "2026-05-29",
            tips: 90,
            gratuity: 10,
            cash: 5,
            total: 100,
        },
    });
    const before = clone(Object.fromEntries(store.docs));

    await assert.rejects(
        () => saveWithFakeStore(store),
        /missing document for update/
    );

    assert.deepEqual(Object.fromEntries(store.docs), before);
});

test("removeShiftAtomically deletes the shift, ledger meta, and every entry in one batch", async () => {
    const store = new FakeStore({
        "shifts/2026-05-29": {
            status: "closed",
            firstClosedAt: "2026-05-29T04:00:00.000Z",
            closedAt: "2026-05-29T04:00:00.000Z",
        },
        "payouts/2026-05-29": { date: "2026-05-29", ledgerVersion: 1 },
        "payouts/2026-05-29/entries/serverUid": {
            uid: "serverUid", date: "2026-05-29", tips: 120, gratuity: 40, cash: 20, total: 180,
        },
        "payouts/2026-05-29/entries/backUid": {
            uid: "backUid", date: "2026-05-29", tips: 60, gratuity: 20, cash: 10, total: 90,
        },
        // A different date must be left untouched.
        "shifts/2026-05-30": { status: "closed" },
        "payouts/2026-05-30": { date: "2026-05-30", ledgerVersion: 1 },
        "payouts/2026-05-30/entries/serverUid": {
            uid: "serverUid", date: "2026-05-30", tips: 10, gratuity: 5, cash: 0, total: 15,
        },
    });

    const result = await removeWithFakeStore(store);

    assert.equal(result.operationId, "removal-operation");
    assert.deepEqual(result.removedPayoutUids, ["backUid", "serverUid"]);
    assert.equal(result.removedPayoutCount, 2);

    // The whole target date is gone.
    assert.equal(store.has("shifts/2026-05-29"), false);
    assert.equal(store.has("payouts/2026-05-29"), false);
    assert.equal(store.has("payouts/2026-05-29/entries/serverUid"), false);
    assert.equal(store.has("payouts/2026-05-29/entries/backUid"), false);

    // Other dates are untouched.
    assert.equal(store.has("shifts/2026-05-30"), true);
    assert.equal(store.has("payouts/2026-05-30"), true);
    assert.equal(store.has("payouts/2026-05-30/entries/serverUid"), true);

    // An audit event records the removal, reusing the existing auditEvents schema.
    const audit = store.get("auditEvents/removal-operation");
    assert.equal(audit.type, "shift_removed");
    assert.equal(audit.date, "2026-05-29");
    assert.equal(audit.actorUid, "adminUid");
    assert.deepEqual(audit.removedPayoutUids, ["backUid", "serverUid"]);
    assert.equal(audit.previousPayoutCount, 2);
});

test("removeShiftAtomically leaves all state unchanged when the batch commit fails", async () => {
    const store = new FakeStore({
        "shifts/2026-05-29": { status: "closed", firstClosedAt: "2026-05-29T04:00:00.000Z" },
        "payouts/2026-05-29": { date: "2026-05-29", ledgerVersion: 1 },
        "payouts/2026-05-29/entries/serverUid": {
            uid: "serverUid", date: "2026-05-29", tips: 120, gratuity: 40, cash: 20, total: 180,
        },
    });
    const before = clone(Object.fromEntries(store.docs));

    await assert.rejects(
        () => removeWithFakeStore(store, { batchOptions: { failCommit: true } }),
        /commit failed/
    );

    assert.deepEqual(Object.fromEntries(store.docs), before);
});

test("unreconciled closeout rejects before writing money state", async () => {
    const store = new FakeStore({
        "users/serverUid": { uid: "serverUid", role: "server", status: "active" },
    });
    const before = clone(Object.fromEntries(store.docs));

    await assert.rejects(
        () => saveClosedShiftAtomically({
            db: {},
            date: "2026-05-29",
            teams: [{
                teamId: "team-1",
                members: [{ uid: "serverUid", name: "Server One", role: "server", points: 1 }],
                pools: {},
            }],
            barTeam: { members: [], pools: {} },
            runners: [],
            payouts: {
                serverUid: {
                    name: "Server One",
                    role: "server",
                    tips: 120,
                    gratuity: 40,
                    cash: 20,
                    total: 160,
                },
            },
            summary: {
                allocations: {
                    doorCTPAllocation: 0,
                    doorGRTAllocation: 0,
                    peCoordinatorGRT: 0,
                    houseAllocation: 0,
                },
                balances: {
                    totalAvailable: 200,
                    totalDistributed: 200,
                    overallBalance: 0,
                },
            },
            realEmployeeUids: new Set(["serverUid"]),
            updatedBy: "adminUid",
            now: "2026-05-30T02:00:00.000Z",
            operationId: "closeout-operation",
            refs: fakeRefs,
            batchFactory: () => new FakeBatch(store),
            readShift: async (shiftRef) => snapshot(store.get(shiftRef.path)),
            readPayoutEntries: async () => store.payoutEntries("2026-05-29"),
        }),
        /Payout reconciliation failed/
    );

    assert.deepEqual(Object.fromEntries(store.docs), before);
});
