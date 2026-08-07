import { doc, getDoc, writeBatch } from "firebase/firestore";

import { buildClosedShiftPayload, getRemovedPayoutUids } from "./shiftPersistence.js";
import {
    buildPayoutLedgerEntry,
    fetchPayoutEntriesForDate,
    PAYOUT_LEDGER_VERSION,
    payoutLedgerEntryRef,
    payoutLedgerMetaRef,
    ledgerEntriesToPayoutMap,
} from "./payoutLedger.js";
import { getHistoryFlagUpdate, getShiftParticipantUids } from "./userHistoryFlags.js";

const timestamp = (now) => now || new Date().toISOString();

export function createCloseoutOperationId(date) {
    const randomPart = globalThis.crypto?.randomUUID?.()
        || Math.random().toString(36).slice(2);
    return `closeout_${date}_${randomPart}`;
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

    Object.entries(payouts).forEach(([uid, payout]) => {
        batch.set(
            refs.payoutEntry(db, date, uid),
            buildPayoutLedgerEntry({
                date,
                uid,
                payout,
                operationId,
                updatedAt: savedAt,
                updatedBy,
            })
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
    };
}
