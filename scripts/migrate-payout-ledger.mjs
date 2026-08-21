#!/usr/bin/env node

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import {
    buildCanonicalPayoutLedgerMigration,
    planPayoutLedgerWrites,
} from "../src/utils/payoutLedgerMigration.js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply || args.has("--dry-run");
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "demo-tip-tracker-test";
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const allowLive = process.env.TIP_TRACKER_ALLOW_LIVE_MIGRATION === "true";
const now = process.env.TIP_TRACKER_MIGRATION_NOW || new Date().toISOString();
const operationId = process.env.TIP_TRACKER_MIGRATION_OPERATION_ID || `payout-ledger-migration-${now.replace(/[:.]/g, "-")}`;

if (!usingEmulator && !allowLive) {
    console.error("Refusing live migration without TIP_TRACKER_ALLOW_LIVE_MIGRATION=true.");
    console.error("For local verification, run through the Firestore emulator.");
    process.exit(1);
}

if (usingEmulator && !projectId.startsWith("demo-")) {
    console.error(`Refusing emulator migration for non-demo project id: ${projectId}`);
    process.exit(1);
}

const app = initializeApp({ projectId });
const db = getFirestore(app);

async function loadLegacyShifts() {
    const snap = await db.collection("shifts").get();
    return snap.docs.map((shiftDoc) => ({
        id: shiftDoc.id,
        data: shiftDoc.data(),
    }));
}

async function loadLegacyTips() {
    const usersSnap = await db.collection("users").get();
    const tips = [];

    for (const userDoc of usersSnap.docs) {
        const tipsSnap = await userDoc.ref.collection("tips").get();
        tipsSnap.docs.forEach((tipDoc) => {
            tips.push({
                uid: userDoc.id,
                date: tipDoc.id,
                data: tipDoc.data(),
            });
        });
    }

    return tips;
}

async function loadExistingLedgerEntries() {
    const payoutDatesSnap = await db.collection("payouts").get();
    const entries = [];

    for (const payoutDateDoc of payoutDatesSnap.docs) {
        const entriesSnap = await payoutDateDoc.ref.collection("entries").get();
        entriesSnap.docs.forEach((entryDoc) => {
            entries.push({
                uid: entryDoc.id,
                ...entryDoc.data(),
            });
        });
    }

    return entries;
}

async function commitWrites(writes) {
    const batchSize = 450;
    for (let index = 0; index < writes.length; index += batchSize) {
        const batch = db.batch();
        writes.slice(index, index + batchSize).forEach((write) => {
            const metaRef = db.collection("payouts").doc(write.date);
            batch.set(metaRef, {
                date: write.date,
                ledgerVersion: write.data.ledgerVersion,
                updatedAt: now,
                updatedBy: "migration",
                operationId,
            }, { merge: true });
            batch.set(metaRef.collection("entries").doc(write.uid), write.data);
        });
        await batch.commit();
    }
}

function printSummary({ migration, plan }) {
    console.log(JSON.stringify({
        projectId,
        emulator: usingEmulator,
        mode: dryRun ? "dry-run" : "apply",
        operationId,
        legacy: migration.counts,
        ledgerPlan: plan.counts,
    }, null, 2));
}

const [shifts, tips, existingLedgerEntries] = await Promise.all([
    loadLegacyShifts(),
    loadLegacyTips(),
    loadExistingLedgerEntries(),
]);

const migration = buildCanonicalPayoutLedgerMigration({ shifts, tips });

if (migration.conflicts.length > 0) {
    printSummary({
        migration,
        plan: { counts: { writes: 0, skipped: 0, conflicts: migration.conflicts.length } },
    });
    console.error("Migration stopped because legacy shift and tip payout amounts conflict.");
    console.error(JSON.stringify(migration.conflicts, null, 2));
    process.exit(1);
}

const plan = planPayoutLedgerWrites({
    desiredEntries: migration.entries,
    existingEntries: existingLedgerEntries,
    operationId,
    updatedAt: now,
});

if (plan.conflicts.length > 0) {
    printSummary({ migration, plan });
    console.error("Migration stopped because existing ledger entries conflict with legacy payout amounts.");
    console.error(JSON.stringify(plan.conflicts, null, 2));
    process.exit(1);
}

printSummary({ migration, plan });

if (dryRun) {
    console.log("Dry run only. Re-run with --apply to write missing ledger entries.");
    process.exit(0);
}

await commitWrites(plan.writes);

const afterLedgerEntries = await loadExistingLedgerEntries();
const verification = planPayoutLedgerWrites({
    desiredEntries: migration.entries,
    existingEntries: afterLedgerEntries,
    operationId,
    updatedAt: now,
});

if (verification.conflicts.length > 0 || verification.writes.length > 0) {
    console.error("Verification failed after migration apply.");
    console.error(JSON.stringify(verification, null, 2));
    process.exit(1);
}

console.log(`Migration verified: ${verification.skipped.length} canonical ledger entries match legacy data.`);
