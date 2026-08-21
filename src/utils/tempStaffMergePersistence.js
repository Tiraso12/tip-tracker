import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    runTransaction,
    where,
} from "firebase/firestore";

import {
    PAYOUT_LEDGER_COLLECTION,
    PAYOUT_LEDGER_VERSION,
    payoutLedgerEntryRef,
    payoutLedgerMetaRef,
} from "./payoutLedger.js";
import { firstNameFor, fullNameFor } from "./userNames.js";

const LEGACY_TIP_COLLECTION = "tips";
const MAX_TRANSACTION_WRITES = 450;
// One click used to stuff every date into a single transaction. A long history
// (Jeff-scale: 50+ nights) times out or blows the write cap before the temp
// profile is deleted. 12 dates is a proven browser-safe piece; each piece stays
// well under the 450-write safety cap, and the temp profile is deleted only
// after the last piece lands.
export const MERGE_DATES_PER_CHUNK = 12;

const timestamp = (now) => now || new Date().toISOString();

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
    return firstNameFor(user, "Unknown");
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

// Every place a shift document can name a person: the dining teams, the bar team,
// the runner list, and the legacy per-shift payout map. A roster reference with no
// money on it is exactly the one this file used to miss.
export function shiftReferencesUid(shiftData, uid) {
    if (!shiftData || !uid) return false;

    const inMembers = (members = []) => members.some(member => member?.uid === uid);

    return (shiftData.teams || []).some(team => inMembers(team?.members))
        || inMembers(shiftData.barTeam?.members)
        || inMembers(shiftData.runners)
        || Boolean(shiftData.payouts?.[uid]);
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

function buildSkippedDate({ date, sources }) {
    return {
        date,
        sources: Array.from(new Set(sources)).sort(),
    };
}

// A date already written by this same temp-profile merge is not a clash. A
// naive retry after a partial success would otherwise read our own
// `mergedFromTempStaff` stamps as the real account's own pay and skip the
// dates it just moved.
export function isMergedFromThisTempStaff(data, tempUid) {
    return Boolean(tempUid) && data?.mergedFromTempStaff?.uid === tempUid;
}

export const firestoreTempStaffMergeRefs = {
    payoutEntry: (db, date, uid) => payoutLedgerEntryRef(db, date, uid),
    payoutMeta: (db, date) => payoutLedgerMetaRef(db, date),
    legacyTip: (db, uid, date) => legacyTipRef(db, uid, date),
    shift: (db, date) => shiftRef(db, date),
    user: (db, uid) => userRef(db, uid),
    tempStaff: (db, uid) => tempStaffRef(db, uid),
    auditEvent: (db, operationId) => auditEventRef(db, operationId),
};

export function countTempStaffMergeWrites({
    ledgerWrites = [],
    ledgerDeletes = [],
    legacyTipWrites = [],
    legacyTipDeletes = [],
    shiftUpdates = [],
    finalize = false,
} = {}) {
    return ledgerWrites.length
        + ledgerDeletes.length
        + ledgerWrites.length
        + legacyTipWrites.length
        + legacyTipDeletes.length
        + shiftUpdates.length
        + (finalize ? 3 : 0);
}

export function chunkTempStaffMergePlan(plan, datesPerChunk = MERGE_DATES_PER_CHUNK) {
    const dates = sortDates([
        ...plan.ledgerWrites.map(write => write.date),
        ...plan.ledgerDeletes.map(entry => entry.date),
        ...plan.legacyTipWrites.map(write => write.date),
        ...plan.legacyTipDeletes.map(entry => entry.date),
        ...plan.shiftUpdates.map(update => update.date),
    ]);

    const chunks = [];
    for (let index = 0; index < dates.length; index += datesPerChunk) {
        const slice = dates.slice(index, index + datesPerChunk);
        const inSlice = (item) => slice.includes(item.date);
        chunks.push({
            dates: slice,
            ledgerWrites: plan.ledgerWrites.filter(inSlice),
            ledgerDeletes: plan.ledgerDeletes.filter(inSlice),
            legacyTipWrites: plan.legacyTipWrites.filter(inSlice),
            legacyTipDeletes: plan.legacyTipDeletes.filter(inSlice),
            shiftUpdates: plan.shiftUpdates.filter(inSlice),
        });
    }

    return chunks;
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
    // `dates` is the MONEY date set: the dates the temp profile holds saved pay on.
    // It drives the per-date skip rule and every ledger/tip write, and it is
    // deliberately unchanged - a roster-only shift adds no money date, so it can
    // never be skipped. Shift rewrites are planned separately below, over every
    // shift handed in that is not on a skipped date.
    const dates = sortDates([
        ...tempLedgerByDate.keys(),
        ...tempTipByDate.keys(),
        ...shiftDocs
            .filter(({ data }) => Boolean(data?.payouts?.[tempUser.uid]))
            .map(({ date }) => date),
    ]);

    // THE SKIP RULE: a date the real account already has its own saved pay on is
    // left exactly as it is - both copies stay put, on the profile that earned
    // them. Overwriting a payout the employee may already have been paid on is the
    // one thing a merge must never do, but one such night does not hold the other
    // dates hostage either: every date the real account has no pay on still moves.
    // All-or-nothing is per date, not per merge.
    const skipped = dates
        .map((date) => {
            const sources = [];
            const shiftPayouts = shiftByDate.get(date)?.data?.payouts || {};
            const targetLedger = targetLedgerByDate.get(date)?.data;
            const targetTip = targetTipByDate.get(date)?.data;

            if (targetLedger && !isMergedFromThisTempStaff(targetLedger, tempUser.uid)) {
                sources.push("canonical ledger");
            }
            if (targetTip && !isMergedFromThisTempStaff(targetTip, tempUser.uid)) {
                sources.push("legacy tip doc");
            }
            if (shiftPayouts[realUser.uid] && !isMergedFromThisTempStaff(shiftPayouts[realUser.uid], tempUser.uid)) {
                sources.push("legacy shift payout");
            }

            return sources.length > 0 ? buildSkippedDate({ date, sources }) : null;
        })
        .filter(Boolean);

    const skippedDates = skipped.map(entry => entry.date);
    // A skipped date is untouched down to its roster: rewriting the shift would
    // move that night's legacy payout map onto the real account, which is the
    // overwrite the skip exists to prevent.
    const isSkipped = (date) => skippedDates.includes(date);
    const mergeDates = dates.filter(date => !isSkipped(date));

    const ledgerWrites = [];
    const ledgerDeletes = [];
    const legacyTipWrites = [];
    const legacyTipDeletes = [];
    const resumedDates = [];

    mergeDates.forEach((date) => {
        const tempLedger = tempLedgerByDate.get(date);
        const targetLedger = targetLedgerByDate.get(date)?.data;
        const ledgerAlreadyMoved = isMergedFromThisTempStaff(targetLedger, tempUser.uid);
        if (tempLedger) {
            if (ledgerAlreadyMoved) {
                resumedDates.push(date);
            } else {
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
            }
            ledgerDeletes.push({ date });
        }

        const tempTip = tempTipByDate.get(date);
        const targetTip = targetTipByDate.get(date)?.data;
        const tipAlreadyMoved = isMergedFromThisTempStaff(targetTip, tempUser.uid);
        if (tempTip) {
            if (tipAlreadyMoved) {
                resumedDates.push(date);
            } else {
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
            }
            legacyTipDeletes.push({ date });
        }

        const shiftPayouts = shiftByDate.get(date)?.data?.payouts || {};
        if (isMergedFromThisTempStaff(shiftPayouts[realUser.uid], tempUser.uid)) {
            resumedDates.push(date);
        }
    });

    // Rewrite EVERY shift that still names the temp profile, whether or not that
    // date carries money. A shift still in `setup` has no payouts and no ledger
    // entry, so it never joins `dates` - and leaving it behind is what used to pay
    // a deleted profile once the night was finally settled.
    const shiftUpdates = shiftDocs
        .filter(({ date }) => !isSkipped(date))
        .map(({ date, data }) => {
            const update = rewriteShiftForTempStaffMerge(data, {
                tempUser,
                realUser,
                operationId,
                updatedAt,
            });
            return update.modified ? { date, data: update.data } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));

    // Dates whose only change is the roster: the manager is told about these
    // separately, because no saved pay moved on them.
    const rosterOnlyShiftDates = shiftUpdates
        .map(update => update.date)
        .filter(date => !mergeDates.includes(date));

    return {
        skipped,
        skippedDates,
        migratedDates: mergeDates,
        resumedDates: sortDates(resumedDates),
        rosterOnlyShiftDates,
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
    outcome,
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
            name: fullNameFor(realUser, null),
            role: realUser.role || null,
        },
        migratedDates: outcome.migratedDates,
        migratedLedgerDates: outcome.ledgerDates,
        migratedLegacyTipDates: outcome.legacyTipDates,
        updatedShiftDates: outcome.updatedShiftDates,
        collisionDates: outcome.skippedDates,
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

// Unsettled nights the temp profile is still rostered on. Settled dates already
// come out of the ledger scan above (a closed shift always leaves a payout entry),
// so the only shifts that can hide a live reference are the ones still in `setup`.
//
// Cost: this is a `status == "setup"` equality query, served by Firestore's
// automatic single-field index, so it reads the open nights only - a handful of
// documents - not the shift history. A full `shifts` scan would grow with every
// night the restaurant has ever worked and is not acceptable on a merge.
export async function discoverUnsettledShiftDates(db, tempUid) {
    const openShifts = await getDocs(query(collection(db, "shifts"), where("status", "==", "setup")));
    return openShifts.docs
        .filter(shift => shiftReferencesUid(shift.data(), tempUid))
        .map(shift => shift.id);
}

function docsFromSnapshots(dates, snapshots) {
    return dates
        .map((date, index) => {
            const data = snapshotData(snapshots[index]);
            return data ? { date, data } : null;
        })
        .filter(Boolean);
}

function applyPlanWrites(transaction, {
    db,
    refs,
    plan,
    tempUser,
    realUser,
    operationId,
    updatedAt,
    updatedBy,
}) {
    const writeCount = countTempStaffMergeWrites(plan);
    if (writeCount > MAX_TRANSACTION_WRITES) {
        throw new Error(`Temp staff merge would write ${writeCount} documents, above the ${MAX_TRANSACTION_WRITES} transaction safety limit.`);
    }

    plan.ledgerWrites.forEach(({ date, data }) => {
        transaction.set(refs.payoutMeta(db, date), {
            date,
            ledgerVersion: PAYOUT_LEDGER_VERSION,
            updatedAt,
            updatedBy,
            operationId,
        }, { merge: true });
        transaction.set(refs.payoutEntry(db, date, realUser.uid), data);
    });

    plan.ledgerDeletes.forEach(({ date }) => {
        transaction.delete(refs.payoutEntry(db, date, tempUser.uid));
    });

    plan.legacyTipWrites.forEach(({ date, data }) => {
        transaction.set(refs.legacyTip(db, realUser.uid, date), data);
    });

    plan.legacyTipDeletes.forEach(({ date }) => {
        transaction.delete(refs.legacyTip(db, tempUser.uid, date));
    });

    plan.shiftUpdates.forEach(({ date, data }) => {
        transaction.update(refs.shift(db, date), data);
    });
}

function applyMergeFinalize(transaction, {
    db,
    refs,
    tempUser,
    realUser,
    operationId,
    updatedAt,
    updatedBy,
    outcome,
}) {
    transaction.update(refs.user(db, realUser.uid), {
        hasShiftHistory: true,
        hasTipHistory: outcome.migratedDates.length > 0,
    });
    transaction.delete(refs.tempStaff(db, tempUser.uid));
    transaction.set(refs.auditEvent(db, operationId), buildMergeAuditEvent({
        tempUser,
        realUser,
        operationId,
        updatedAt,
        updatedBy,
        outcome,
    }));
}

async function readMergeDocsForDates({
    readSnapshot,
    db,
    refs,
    dates,
    tempUser,
    realUser,
}) {
    const [
        tempLedgerSnapshots,
        targetLedgerSnapshots,
        tempLegacySnapshots,
        targetLegacySnapshots,
        shiftSnapshots,
    ] = await Promise.all([
        Promise.all(dates.map(date => readSnapshot(refs.payoutEntry(db, date, tempUser.uid)))),
        Promise.all(dates.map(date => readSnapshot(refs.payoutEntry(db, date, realUser.uid)))),
        Promise.all(dates.map(date => readSnapshot(refs.legacyTip(db, tempUser.uid, date)))),
        Promise.all(dates.map(date => readSnapshot(refs.legacyTip(db, realUser.uid, date)))),
        Promise.all(dates.map(date => readSnapshot(refs.shift(db, date)))),
    ]);

    return {
        tempLedgerEntries: docsFromSnapshots(dates, tempLedgerSnapshots)
            .map(entry => ({ ...entry, data: { uid: tempUser.uid, ...entry.data } })),
        targetLedgerEntries: docsFromSnapshots(dates, targetLedgerSnapshots),
        tempLegacyTips: docsFromSnapshots(dates, tempLegacySnapshots),
        targetLegacyTips: docsFromSnapshots(dates, targetLegacySnapshots),
        shiftDocs: docsFromSnapshots(dates, shiftSnapshots),
    };
}

// Every piece of a chunked merge commits on its own, so a failure part-way through
// leaves the dates before it already on the real account. Stamping the dates that are
// already committed onto whatever error comes out is what lets the manager be told
// which nights moved before it stopped, instead of a blanket "it failed".
function runInMergeChunk(movedDates, run) {
    return run().catch((error) => {
        if (error && typeof error === "object") {
            error.movedDates = [...movedDates];
        }
        throw error;
    });
}

export async function mergeTempStaffIntoAccount({
    db,
    tempUser,
    realUser,
    updatedBy = null,
    now,
    operationId = createTempStaffMergeOperationId(tempUser.uid, realUser.uid),
    runTransaction: runTransactionFn = runTransaction,
    refs = firestoreTempStaffMergeRefs,
    readDoc = getDoc,
    discoverLedgerEntries = discoverTempLedgerEntries,
    discoverLegacyTips = discoverTempLegacyTips,
    discoverUnsettledDates = discoverUnsettledShiftDates,
    onProgress,
}) {
    const updatedAt = timestamp(now);
    const [discoveredLedgerEntries, discoveredLegacyTips, unsettledShiftDates] = await Promise.all([
        discoverLedgerEntries(db, tempUser.uid),
        discoverLegacyTips(db, tempUser.uid),
        discoverUnsettledDates(db, tempUser.uid),
    ]);
    // Both the money dates and the open nights the profile is still rostered on. The
    // merge has to rewrite all of them before deleting the profile, or settling one
    // of those nights afterwards pays a UID with no profile behind it.
    const discoveredDates = sortDates([
        ...discoveredLedgerEntries.map(entry => entry.date),
        ...discoveredLegacyTips.map(entry => entry.date),
        ...unsettledShiftDates,
    ]);

    const preflight = await readMergeDocsForDates({
        readSnapshot: readDoc,
        db,
        refs,
        dates: discoveredDates,
        tempUser,
        realUser,
    });

    const plan = buildTempStaffMergePlan({
        tempUser,
        realUser,
        ...preflight,
        operationId,
        updatedAt,
        updatedBy,
    });

    const chunks = chunkTempStaffMergePlan(plan);
    const totalDates = chunks.reduce((sum, chunk) => sum + chunk.dates.length, 0);
    let completedDates = 0;

    onProgress?.({
        phase: "moving",
        completedChunks: 0,
        totalChunks: chunks.length,
        completedDates: 0,
        totalDates,
    });

    // What the pieces actually did, not what the preflight plan hoped they would.
    // Each piece re-reads its dates inside the transaction, so a night settled on
    // the real account while the merge is running is skipped by that piece - and
    // the manager has to be told the truth about that date, not the plan's guess.
    const movedDates = [];
    const skippedDates = [];
    const ledgerDates = [];
    const legacyTipDates = [];
    const updatedShiftDates = [];
    const rosterOnlyShiftDates = [];

    for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        let livePlan = null;
        await runInMergeChunk(movedDates, () => runTransactionFn(db, async (transaction) => {
            const liveDocs = await readMergeDocsForDates({
                readSnapshot: (ref) => transaction.get(ref),
                db,
                refs,
                dates: chunk.dates,
                tempUser,
                realUser,
            });
            livePlan = buildTempStaffMergePlan({
                tempUser,
                realUser,
                ...liveDocs,
                operationId,
                updatedAt,
                updatedBy,
            });

            applyPlanWrites(transaction, {
                db,
                refs,
                plan: livePlan,
                tempUser,
                realUser,
                operationId,
                updatedAt,
                updatedBy,
            });
        }));

        movedDates.push(...livePlan.migratedDates);
        skippedDates.push(...livePlan.skippedDates);
        ledgerDates.push(...livePlan.ledgerWrites.map(write => write.date));
        legacyTipDates.push(...livePlan.legacyTipWrites.map(write => write.date));
        updatedShiftDates.push(...livePlan.shiftUpdates.map(update => update.date));
        rosterOnlyShiftDates.push(...livePlan.rosterOnlyShiftDates);

        completedDates += chunk.dates.length;
        onProgress?.({
            phase: "moving",
            completedChunks: index + 1,
            totalChunks: chunks.length,
            completedDates,
            totalDates,
        });
    }

    const outcome = {
        migratedDates: sortDates(movedDates),
        skippedDates: sortDates([...skippedDates, ...plan.skippedDates]),
        ledgerDates: sortDates(ledgerDates),
        legacyTipDates: sortDates(legacyTipDates),
        updatedShiftDates: sortDates(updatedShiftDates),
        rosterOnlyShiftDates: sortDates(rosterOnlyShiftDates),
    };

    await runInMergeChunk(movedDates, () => runTransactionFn(db, async (transaction) => {
        applyMergeFinalize(transaction, {
            db,
            refs,
            tempUser,
            realUser,
            operationId,
            updatedAt,
            updatedBy,
            outcome,
        });
    }));

    const result = {
        operationId,
        updatedAt,
        migratedDates: outcome.migratedDates,
        skippedDates: outcome.skippedDates,
        rosterOnlyShiftDates: outcome.rosterOnlyShiftDates,
        updatedShiftDates: outcome.updatedShiftDates,
    };

    // The profile is deleted now, so re-check the open nights and hand back anything
    // that still names it - a shift saved between discovery and commit would land
    // outside the written date set. The caller must not report a plain success
    // while this list has dates in it: those rosters point at a profile that is gone.
    // The merge itself is already committed here, so a failed re-check is reported as
    // an unverified merge rather than thrown as a failed one.
    try {
        return { ...result, unresolvedShiftDates: await discoverUnsettledDates(db, tempUser.uid) };
    } catch (error) {
        console.error("Temp staff merge committed, but re-checking open floor plans failed:", error);
        return { ...result, unresolvedShiftDates: [], unresolvedShiftDatesUnknown: true };
    }
}

// What the manager is told after a merge. It reports what actually moved rather
// than an unconditional "merged", and it never claims success while a floor plan
// still names the profile that was just deleted.
export function formatTempStaffMergeResultMessage({
    realUser,
    migratedDates = [],
    skippedDates = [],
    rosterOnlyShiftDates = [],
    unresolvedShiftDates = [],
    unresolvedShiftDatesUnknown = false,
} = {}) {
    const account = displayNameFor(realUser || {});

    if (unresolvedShiftDates.length > 0) {
        return `Merge incomplete. The temporary profile was removed, but ${unresolvedShiftDates.length === 1 ? "this floor plan" : "these floor plans"} still list it: ${unresolvedShiftDates.join(", ")}.

Open ${unresolvedShiftDates.length === 1 ? "that date" : "those dates"} and put ${account} on the floor in its place before you settle up, or that night's payout goes to a profile that no longer exists.`;
    }

    const lines = [`Temporary profile merged into ${account}.`, ""];

    if (migratedDates.length > 0) {
        lines.push(`Payout history moved: ${migratedDates.join(", ")}.`);
    } else if (skippedDates.length === 0) {
        lines.push("No saved payout history to move.");
    }

    if (skippedDates.length > 0) {
        lines.push(`Left on the temporary profile, because ${account} already has saved pay of their own on ${skippedDates.length === 1 ? "that night" : "those nights"}: ${skippedDates.join(", ")}. Nothing already paid was overwritten - check ${skippedDates.length === 1 ? "that date" : "those dates"} if you think the same night was recorded twice.`);
    }

    if (rosterOnlyShiftDates.length > 0) {
        lines.push(`Floor plan${rosterOnlyShiftDates.length === 1 ? "" : "s"} updated, with no payout saved yet: ${rosterOnlyShiftDates.join(", ")}.`);
    }

    if (unresolvedShiftDatesUnknown) {
        lines.push("", "The saved floor plans could not be re-checked afterwards. Open any night this person is still on and make sure it lists the real account before you settle up.");
    }

    return lines.join("\n");
}
