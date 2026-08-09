import { doc, getDoc, writeBatch } from "firebase/firestore";

import { buildClosedShiftPayload, getRemovedPayoutUids } from "./shiftPersistence.js";
import {
    buildPayoutLedgerEntry,
    fetchPayoutEntriesForDate,
    PAYOUT_LEDGER_VERSION,
    payoutLedgerEntryRef,
    payoutLedgerMetaRef,
    ledgerEntriesToPayoutMap,
    reconcilePayoutLedger,
} from "./payoutLedger.js";
import { getHistoryFlagUpdate, getShiftParticipantUids } from "./userHistoryFlags.js";

const timestamp = (now) => now || new Date().toISOString();

export function createCloseoutOperationId(date) {
    const randomPart = globalThis.crypto?.randomUUID?.()
        || Math.random().toString(36).slice(2);
    return `closeout_${date}_${randomPart}`;
}

export function createRemovalOperationId(date) {
    const randomPart = globalThis.crypto?.randomUUID?.()
        || Math.random().toString(36).slice(2);
    return `removal_${date}_${randomPart}`;
}

export const firestoreCloseoutRefs = {
    shift: (db, date) => doc(db, "shifts", date),
    payoutMeta: (db, date) => payoutLedgerMetaRef(db, date),
    payoutEntry: (db, date, uid) => payoutLedgerEntryRef(db, date, uid),
    user: (db, uid) => doc(db, "users", uid),
    auditEvent: (db, operationId) => doc(db, "auditEvents", operationId),
};

function getDocData(snapshot) {
    if (!snapshot?.exists?.()) return null;
    return snapshot.data();
}

function buildCloseoutAuditEvent({
    date,
    operationId,
    actorUid,
    createdAt,
    existingShift,
    previousPayoutUids,
    nextPayoutUids,
    removedPayoutUids,
}) {
    const wasClosed = existingShift?.status === "closed" || Boolean(existingShift?.firstClosedAt || existingShift?.closedAt);

    return {
        type: wasClosed ? "shift_recalculated" : "shift_closed",
        date,
        shiftId: date,
        operationId,
        actorUid: actorUid || null,
        createdAt,
        ledgerVersion: PAYOUT_LEDGER_VERSION,
        previousPayoutUids,
        nextPayoutUids,
        removedPayoutUids,
        previousPayoutCount: previousPayoutUids.length,
        nextPayoutCount: nextPayoutUids.length,
    };
}

export async function saveClosedShiftAtomically({
    db,
    date,
    teams,
    barTeam,
    runners,
    payouts,
    summary,
    realEmployeeUids = new Set(),
    updatedBy = null,
    now,
    operationId = createCloseoutOperationId(date),
    refs = firestoreCloseoutRefs,
    batchFactory = writeBatch,
    readShift = async (shiftRef) => getDoc(shiftRef),
    readPayoutEntries = async () => fetchPayoutEntriesForDate(db, date),
}) {
    const savedAt = timestamp(now);
    const shiftRef = refs.shift(db, date);
    const existingShiftSnapshot = await readShift(shiftRef);
    const existingShift = getDocData(existingShiftSnapshot);
    const previousPayoutEntries = await readPayoutEntries();
    const previousPayouts = ledgerEntriesToPayoutMap(previousPayoutEntries);
    const removedPayoutUids = getRemovedPayoutUids(previousPayouts, payouts);
    const nextPayoutUids = Object.keys(payouts).sort();
    const previousPayoutUids = Object.keys(previousPayouts).sort();
    const nextPayoutEntries = Object.entries(payouts).map(([uid, payout]) => buildPayoutLedgerEntry({
        date,
        uid,
        payout,
        operationId,
        updatedAt: savedAt,
        updatedBy,
    }));
    const payoutReconciliation = reconcilePayoutLedger({ summary, entries: nextPayoutEntries });

    if (!payoutReconciliation.ok) {
        throw new Error(`Payout reconciliation failed: ${payoutReconciliation.messages.join(" ")}`);
    }

    const batch = batchFactory(db);
    const shiftPayload = buildClosedShiftPayload({
        date,
        teams,
        barTeam,
        runners,
        summary,
        now: savedAt,
        existingShift,
        operationId,
        updatedBy,
    });

    batch.set(shiftRef, shiftPayload);
    batch.set(refs.payoutMeta(db, date), {
        date,
        ledgerVersion: PAYOUT_LEDGER_VERSION,
        updatedAt: savedAt,
        updatedBy,
        operationId,
    }, { merge: true });

    nextPayoutEntries.forEach((entry) => {
        batch.set(
            refs.payoutEntry(db, date, entry.uid),
            entry
        );
    });

    removedPayoutUids.forEach((uid) => {
        batch.delete(refs.payoutEntry(db, date, uid));
    });

    const flagUpdate = getHistoryFlagUpdate("closed");
    getShiftParticipantUids({ teams, barTeam, runners, payouts })
        .filter((uid) => realEmployeeUids.has(uid))
        .sort()
        .forEach((uid) => {
            batch.update(refs.user(db, uid), flagUpdate);
        });

    batch.set(refs.auditEvent(db, operationId), buildCloseoutAuditEvent({
        date,
        operationId,
        actorUid: updatedBy,
        createdAt: savedAt,
        existingShift,
        previousPayoutUids,
        nextPayoutUids,
        removedPayoutUids,
    }));

    await batch.commit();

    return {
        operationId,
        savedAt,
        shiftPayload,
        previousPayoutUids,
        nextPayoutUids,
        removedPayoutUids,
        payoutReconciliation,
    };
}

function buildRemovalAuditEvent({
    date,
    operationId,
    actorUid,
    createdAt,
    removedPayoutUids,
}) {
    // Reuses the existing auditEvents key schema (validated by firestore.rules):
    // removedPayoutUids + previousPayoutCount describe what the removal cleared.
    return {
        type: "shift_removed",
        date,
        shiftId: date,
        operationId,
        actorUid: actorUid || null,
        createdAt,
        ledgerVersion: PAYOUT_LEDGER_VERSION,
        removedPayoutUids,
        previousPayoutCount: removedPayoutUids.length,
    };
}

// Hard-deletes an entire settled date: the shifts/{date} doc, the payouts/{date}
// meta doc, and every payouts/{date}/entries/* entry, in one atomic batch -
// mirroring saveClosedShiftAtomically in reverse. Because the employee dashboard
// subscribes to the ledger live, deleting the entries clears each affected
// employee's card the moment the batch commits. An auditEvents record is written
// for the removal. There is no tombstone/voided-status: this is a hard delete.
export async function removeShiftAtomically({
    db,
    date,
    updatedBy = null,
    now,
    operationId = createRemovalOperationId(date),
    refs = firestoreCloseoutRefs,
    batchFactory = writeBatch,
    readPayoutEntries = async () => fetchPayoutEntriesForDate(db, date),
}) {
    const removedAt = timestamp(now);
    const shiftRef = refs.shift(db, date);
    const previousPayoutEntries = await readPayoutEntries();
    const removedPayoutUids = previousPayoutEntries
        .map((entry) => entry.uid)
        .filter(Boolean)
        .sort();

    const batch = batchFactory(db);

    batch.delete(shiftRef);
    batch.delete(refs.payoutMeta(db, date));
    removedPayoutUids.forEach((uid) => {
        batch.delete(refs.payoutEntry(db, date, uid));
    });

    batch.set(refs.auditEvent(db, operationId), buildRemovalAuditEvent({
        date,
        operationId,
        actorUid: updatedBy,
        createdAt: removedAt,
        removedPayoutUids,
    }));

    await batch.commit();

    return {
        operationId,
        removedAt,
        removedPayoutUids,
        removedPayoutCount: removedPayoutUids.length,
    };
}
