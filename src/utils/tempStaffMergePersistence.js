import {
    collection,
    doc,
    getDoc,
    getDocs,
    runTransaction,
} from "firebase/firestore";

import {
    PAYOUT_LEDGER_COLLECTION,
    PAYOUT_LEDGER_VERSION,
    payoutLedgerEntryRef,
    payoutLedgerMetaRef,
} from "./payoutLedger.js";

const LEGACY_TIP_COLLECTION = "tips";
const MAX_TRANSACTION_WRITES = 450;

const timestamp = (now) => now || new Date().toISOString();

export class TempStaffMergeCollisionError extends Error {
    constructor(collisions) {
        const dates = collisions.map(collision => collision.date).join(", ");
        super(`Temp staff merge stopped because the target account already has saved payouts on: ${dates}`);
        this.name = "TempStaffMergeCollisionError";
        this.collisions = collisions;
    }
}

export function createTempStaffMergeOperationId(tempUid, realUid) {
    const randomPart = globalThis.crypto?.randomUUID?.()
        || Math.random().toString(36).slice(2);
    return `temp_merge_${tempUid}_${realUid}_${randomPart}`;
}

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function snapshotData(snapshot) {
    if (!snapshot?.exists?.()) return null;
    return snapshot.data();
}

function displayNameFor(user = {}) {
    return user.username || user.name || "Unknown";
}

function sortDates(dates) {
    return Array.from(new Set(dates.filter(Boolean))).sort();
}

function byDate(items = []) {
    return new Map(items.map(item => [item.date, item]));
}

function legacyTipRef(db, uid, date) {
    return doc(db, "users", uid, LEGACY_TIP_COLLECTION, date);
}

function shiftRef(db, date) {
    return doc(db, "shifts", date);
}

function userRef(db, uid) {
    return doc(db, "users", uid);
}

function tempStaffRef(db, uid) {
    return doc(db, "unregisteredStaff", uid);
}

function auditEventRef(db, operationId) {
    return doc(db, "auditEvents", operationId);
}

function updateMember(member, tempUid, realUser, originalTempStaff) {
    if (member?.uid !== tempUid) return { member, modified: false };

    return {
        member: {
            ...member,
            uid: realUser.uid,
            name: displayNameFor(realUser),
            mergedFromTempStaff: originalTempStaff,
        },
        modified: true,
    };
}

function rewriteMembers(members = [], tempUid, realUser, originalTempStaff) {
    let modified = false;
    const nextMembers = members.map(member => {
        const next = updateMember(member, tempUid, realUser, originalTempStaff);
        modified = modified || next.modified;
        return next.member;
    });

    return { members: nextMembers, modified };
}

export function rewriteShiftForTempStaffMerge(shiftData, { tempUser, realUser, operationId, updatedAt }) {
    if (!shiftData) return { modified: false, data: null };

    const tempUid = tempUser.uid;
    const originalTempStaff = {
        uid: tempUser.uid,
        name: tempUser.name || null,
        role: tempUser.role || null,
    };
    const nextShift = clone(shiftData);
    let modified = false;

    nextShift.teams = (nextShift.teams || []).map(team => {
        const next = rewriteMembers(team.members || [], tempUid, realUser, originalTempStaff);
        modified = modified || next.modified;
        return { ...team, members: next.members };
    });

    if (nextShift.barTeam?.members) {
        const next = rewriteMembers(nextShift.barTeam.members, tempUid, realUser, originalTempStaff);
        modified = modified || next.modified;
        nextShift.barTeam = { ...nextShift.barTeam, members: next.members };
    }

    if (nextShift.runners) {
        const next = rewriteMembers(nextShift.runners, tempUid, realUser, originalTempStaff);
        modified = modified || next.modified;
        nextShift.runners = next.members;
    }

    if (nextShift.payouts?.[tempUid]) {
        const payoutData = {
            ...nextShift.payouts[tempUid],
            uid: realUser.uid,
            name: displayNameFor(realUser),
            mergedFromTempStaff: originalTempStaff,
            mergeOperationId: operationId,
        };
        nextShift.payouts = {
            ...nextShift.payouts,
            [realUser.uid]: payoutData,
        };
        delete nextShift.payouts[tempUid];
        modified = true;
    }

    if (!modified) return { modified: false, data: shiftData };

    return {
        modified: true,
        data: {
            ...nextShift,
            updatedAt,
            operationId: nextShift.operationId || operationId,
            lastTempStaffMergeAt: updatedAt,
        },
    };
}

function buildMergedLedgerEntry({ date, tempEntry, tempUser, realUser, operationId, updatedAt, updatedBy }) {
    return {
        ...tempEntry,
        date,
        uid: realUser.uid,
        name: displayNameFor(realUser),
        ledgerVersion: tempEntry.ledgerVersion || PAYOUT_LEDGER_VERSION,
        operationId,
        updatedAt,
        updatedBy,
        source: "temp_staff_merge",
        previousSource: tempEntry.source || null,
        mergedFromTempStaff: {
            uid: tempUser.uid,
            name: tempUser.name || tempEntry.name || null,
            role: tempUser.role || tempEntry.role || null,
        },
    };
}

function buildMergedLegacyTip({ date, tempTip, tempUser, realUser, operationId, updatedAt, updatedBy }) {
    return {
        ...tempTip,
        shiftDate: tempTip.shiftDate || date,
        name: displayNameFor(realUser),
        updatedAt,
        updatedBy,
        mergeOperationId: operationId,
        mergedFromTempStaff: {
            uid: tempUser.uid,
            name: tempUser.name || tempTip.name || null,
            role: tempUser.role || tempTip.role || null,
        },
    };
}

function buildCollision({ date, sources }) {
    return {
        date,
        sources: Array.from(new Set(sources)).sort(),
    };
}

export function buildTempStaffMergePlan({
    tempUser,
    realUser,
    tempLedgerEntries = [],
    targetLedgerEntries = [],
    tempLegacyTips = [],
    targetLegacyTips = [],
    shiftDocs = [],
    operationId,
    updatedAt,
    updatedBy = null,
}) {
    const tempLedgerByDate = byDate(tempLedgerEntries);
    const targetLedgerByDate = byDate(targetLedgerEntries);
    const tempTipByDate = byDate(tempLegacyTips);
    const targetTipByDate = byDate(targetLegacyTips);
    const shiftByDate = byDate(shiftDocs);
    const dates = sortDates([
        ...tempLedgerByDate.keys(),
        ...tempTipByDate.keys(),
        ...shiftDocs
            .filter(({ data }) => Boolean(data?.payouts?.[tempUser.uid]))
            .map(({ date }) => date),
    ]);

    const collisions = dates
        .map((date) => {
            const sources = [];
            const shiftPayouts = shiftByDate.get(date)?.data?.payouts || {};

            if (targetLedgerByDate.has(date)) sources.push("canonical ledger");
            if (targetTipByDate.has(date)) sources.push("legacy tip doc");
            if (shiftPayouts[realUser.uid]) sources.push("legacy shift payout");

            return sources.length > 0 ? buildCollision({ date, sources }) : null;
        })
        .filter(Boolean);

    if (collisions.length > 0) {
        return {
            canMerge: false,
            collisions,
            migratedDates: [],
            ledgerWrites: [],
            ledgerDeletes: [],
            legacyTipWrites: [],
            legacyTipDeletes: [],
            shiftUpdates: [],
        };
    }

    const ledgerWrites = [];
    const ledgerDeletes = [];
    const legacyTipWrites = [];
    const legacyTipDeletes = [];
    const shiftUpdates = [];

    dates.forEach((date) => {
        const tempLedger = tempLedgerByDate.get(date);
        if (tempLedger) {
            ledgerWrites.push({
                date,
                data: buildMergedLedgerEntry({
                    date,
                    tempEntry: tempLedger.data,
                    tempUser,
                    realUser,
                    operationId,
                    updatedAt,
                    updatedBy,
                }),
            });
            ledgerDeletes.push({ date });
        }

        const tempTip = tempTipByDate.get(date);
        if (tempTip) {
            legacyTipWrites.push({
                date,
                data: buildMergedLegacyTip({
                    date,
                    tempTip: tempTip.data,
                    tempUser,
                    realUser,
                    operationId,
                    updatedAt,
                    updatedBy,
                }),
            });
            legacyTipDeletes.push({ date });
        }

        const shiftDoc = shiftByDate.get(date);
        const shiftUpdate = rewriteShiftForTempStaffMerge(shiftDoc?.data, {
            tempUser,
            realUser,
            operationId,
            updatedAt,
        });
        if (shiftDoc && shiftUpdate.modified) {
            shiftUpdates.push({
                date,
                data: shiftUpdate.data,
            });
        }
    });

    return {
        canMerge: true,
        collisions: [],
        migratedDates: dates,
        ledgerWrites,
        ledgerDeletes,
        legacyTipWrites,
        legacyTipDeletes,
        shiftUpdates,
    };
}

function buildMergeAuditEvent({
    tempUser,
    realUser,
    operationId,
    updatedAt,
    updatedBy,
    plan,
}) {
    return {
        type: "temp_staff_merged",
        operationId,
        actorUid: updatedBy,
        createdAt: updatedAt,
        ledgerVersion: PAYOUT_LEDGER_VERSION,
        tempStaff: {
            uid: tempUser.uid,
            name: tempUser.name || null,
            role: tempUser.role || null,
            createdAt: tempUser.createdAt || null,
        },
        targetUser: {
            uid: realUser.uid,
            username: realUser.username || null,
            name: realUser.name || null,
            role: realUser.role || null,
        },
        migratedDates: plan.migratedDates,
        migratedLedgerDates: plan.ledgerWrites.map(write => write.date),
        migratedLegacyTipDates: plan.legacyTipWrites.map(write => write.date),
        updatedShiftDates: plan.shiftUpdates.map(update => update.date),
        collisionDates: [],
    };
}

async function discoverTempLedgerEntries(db, tempUid) {
    const payoutDatesSnap = await getDocs(collection(db, PAYOUT_LEDGER_COLLECTION));
    const entrySnapshots = await Promise.all(payoutDatesSnap.docs.map(async (payoutDateDoc) => {
        const entryRef = payoutLedgerEntryRef(db, payoutDateDoc.id, tempUid);
        const entrySnapshot = await getDoc(entryRef);
        return {
            date: payoutDateDoc.id,
            ref: entryRef,
            snapshot: entrySnapshot,
        };
    }));

    return entrySnapshots
        .map(({ date, ref, snapshot }) => ({
            date,
            ref,
            data: snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null,
        }))
        .filter(entry => entry.data);
}

async function discoverTempLegacyTips(db, tempUid) {
    const snap = await getDocs(collection(db, "users", tempUid, LEGACY_TIP_COLLECTION));
    return snap.docs.map(snapshot => ({
        date: snapshot.id,
        ref: snapshot.ref,
        data: snapshot.data(),
    }));
}

function transactionRead(tx, ref) {
    return tx.get(ref);
}

export async function mergeTempStaffIntoAccount({
    db,
    tempUser,
    realUser,
    updatedBy = null,
    now,
    operationId = createTempStaffMergeOperationId(tempUser.uid, realUser.uid),
}) {
    const updatedAt = timestamp(now);
    const [discoveredLedgerEntries, discoveredLegacyTips] = await Promise.all([
        discoverTempLedgerEntries(db, tempUser.uid),
        discoverTempLegacyTips(db, tempUser.uid),
    ]);
    const discoveredDates = sortDates([
        ...discoveredLedgerEntries.map(entry => entry.date),
        ...discoveredLegacyTips.map(entry => entry.date),
    ]);
    const auditRef = auditEventRef(db, operationId);

    return runTransaction(db, async (transaction) => {
        const tempLedgerSnapshots = await Promise.all(discoveredLedgerEntries.map(entry => transactionRead(transaction, entry.ref)));
        const tempLegacySnapshots = await Promise.all(discoveredLegacyTips.map(entry => transactionRead(transaction, entry.ref)));
        const targetLedgerSnapshots = await Promise.all(discoveredDates.map(date =>
            transactionRead(transaction, payoutLedgerEntryRef(db, date, realUser.uid))
        ));
        const targetLegacySnapshots = await Promise.all(discoveredDates.map(date =>
            transactionRead(transaction, legacyTipRef(db, realUser.uid, date))
        ));
        const shiftSnapshots = await Promise.all(discoveredDates.map(date =>
            transactionRead(transaction, shiftRef(db, date))
        ));

        const tempLedgerEntries = discoveredLedgerEntries
            .map((entry, index) => {
                const data = snapshotData(tempLedgerSnapshots[index]);
                return data ? { date: entry.date, ref: entry.ref, data: { uid: tempUser.uid, ...data } } : null;
            })
            .filter(Boolean);
        const tempLegacyTips = discoveredLegacyTips
            .map((entry, index) => {
                const data = snapshotData(tempLegacySnapshots[index]);
                return data ? { date: entry.date, ref: entry.ref, data } : null;
            })
            .filter(Boolean);
        const targetLedgerEntries = discoveredDates
            .map((date, index) => {
                const data = snapshotData(targetLedgerSnapshots[index]);
                return data ? { date, data } : null;
            })
            .filter(Boolean);
        const targetLegacyTips = discoveredDates
            .map((date, index) => {
                const data = snapshotData(targetLegacySnapshots[index]);
                return data ? { date, data } : null;
            })
            .filter(Boolean);
        const shiftDocs = discoveredDates
            .map((date, index) => {
                const data = snapshotData(shiftSnapshots[index]);
                return data ? { date, data } : null;
            })
            .filter(Boolean);

        const plan = buildTempStaffMergePlan({
            tempUser,
            realUser,
            tempLedgerEntries,
            targetLedgerEntries,
            tempLegacyTips,
            targetLegacyTips,
            shiftDocs,
            operationId,
            updatedAt,
            updatedBy,
        });

        if (!plan.canMerge) {
            throw new TempStaffMergeCollisionError(plan.collisions);
        }

        const writeCount = plan.ledgerWrites.length
            + plan.ledgerDeletes.length
            + plan.ledgerWrites.length
            + plan.legacyTipWrites.length
            + plan.legacyTipDeletes.length
            + plan.shiftUpdates.length
            + 3;

        if (writeCount > MAX_TRANSACTION_WRITES) {
            throw new Error(`Temp staff merge would write ${writeCount} documents, above the ${MAX_TRANSACTION_WRITES} transaction safety limit.`);
        }

        plan.ledgerWrites.forEach(({ date, data }) => {
            transaction.set(payoutLedgerMetaRef(db, date), {
                date,
                ledgerVersion: PAYOUT_LEDGER_VERSION,
                updatedAt,
                updatedBy,
                operationId,
            }, { merge: true });
            transaction.set(payoutLedgerEntryRef(db, date, realUser.uid), data);
        });

        plan.ledgerDeletes.forEach(({ date }) => {
            transaction.delete(payoutLedgerEntryRef(db, date, tempUser.uid));
        });

        plan.legacyTipWrites.forEach(({ date, data }) => {
            transaction.set(legacyTipRef(db, realUser.uid, date), data);
        });

        plan.legacyTipDeletes.forEach(({ date }) => {
            transaction.delete(legacyTipRef(db, tempUser.uid, date));
        });

        plan.shiftUpdates.forEach(({ date, data }) => {
            transaction.update(shiftRef(db, date), data);
        });

        transaction.update(userRef(db, realUser.uid), {
            hasShiftHistory: true,
            hasTipHistory: plan.migratedDates.length > 0 || plan.legacyTipWrites.length > 0 || plan.ledgerWrites.length > 0,
        });
        transaction.delete(tempStaffRef(db, tempUser.uid));
        transaction.set(auditRef, buildMergeAuditEvent({
            tempUser,
            realUser,
            operationId,
            updatedAt,
            updatedBy,
            plan,
        }));

        return {
            operationId,
            updatedAt,
            migratedDates: plan.migratedDates,
            updatedShiftDates: plan.shiftUpdates.map(update => update.date),
        };
    });
}

export function formatTempStaffMergeCollisionMessage(collisions = []) {
    const dates = collisions.map(collision => collision.date).join(", ");
    return `Merge stopped. The target account already has saved payout history on ${dates}. No records were changed.`;
}

export function isTempStaffMergeCollisionError(error) {
    return error instanceof TempStaffMergeCollisionError
        || error?.name === "TempStaffMergeCollisionError";
}
