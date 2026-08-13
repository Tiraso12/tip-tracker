#!/usr/bin/env node

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { planUserProfileNameBackfill } from "../src/utils/userProfileNameBackfill.js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "demo-tip-tracker-test";
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const allowLive = process.env.TIP_TRACKER_ALLOW_LIVE_MIGRATION === "true";

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

async function loadUsers() {
    const snapshot = await db.collection("users").get();
    return snapshot.docs.map((userDoc) => ({ id: userDoc.id, data: userDoc.data() }));
}

async function commitWrites(writes) {
    const batchSize = 450;
    for (let index = 0; index < writes.length; index += batchSize) {
        const batch = db.batch();
        writes.slice(index, index + batchSize).forEach((write) => {
            batch.set(db.collection("users").doc(write.id), write.data, { merge: true });
        });
        await batch.commit();
    }
}

function report(plan, mode) {
    console.log(JSON.stringify({
        projectId,
        emulator: usingEmulator,
        mode,
        ...plan.counts,
        changedUserIds: plan.writes.map((write) => write.id),
        skippedUserIds: plan.skipped,
        invalidUsers: plan.invalid,
    }, null, 2));
}

const plan = planUserProfileNameBackfill(await loadUsers());
report(plan, apply ? "apply" : "dry-run");

if (plan.invalid.length > 0) {
    console.error("Backfill stopped because one or more users have no legacy username to copy.");
    process.exit(1);
}

if (!apply) {
    console.log("Dry run only. Re-run with --apply to write the planned fields.");
    process.exit(0);
}

await commitWrites(plan.writes);

const verification = planUserProfileNameBackfill(await loadUsers());
if (verification.invalid.length > 0 || verification.writes.length > 0) {
    console.error("Verification failed after applying the backfill.");
    report(verification, "verification");
    process.exit(1);
}

console.log(`Backfill verified: ${verification.counts.scanned} users have firstName and lastName.`);
