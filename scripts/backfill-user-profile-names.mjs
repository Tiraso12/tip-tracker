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

function describeFields(fields) {
    return Object.entries(fields)
        .map(([field, value]) => `${field}=${JSON.stringify(value)}`)
        .join(", ");
}

// Somebody reads this and decides whether to let the script write to real user
// records, so lead with the three numbers that decision turns on and name every
// profile the backfill cannot fix on its own.
function report(plan, mode) {
    const target = usingEmulator ? `${projectId} (emulator)` : `${projectId} (LIVE)`;
    console.log(`\nUser profile name backfill - ${mode} against ${target}`);
    console.log(`  scanned:            ${plan.counts.scanned}`);
    console.log(`  will change:        ${plan.counts.changed}`);
    console.log(`  already valid:      ${plan.counts.skipped}`);
    console.log(`  cannot fix here:    ${plan.counts.invalid}`);

    if (plan.writes.length > 0) {
        console.log(`\nWill change (${plan.writes.length}):`);
        plan.writes.forEach((write) => {
            console.log(`  ${write.id}  ->  ${describeFields(write.data)}`);
        });
    }

    if (plan.invalid.length > 0) {
        console.log(`\nCannot fix automatically (${plan.invalid.length}) - these need a person:`);
        plan.invalid.forEach((entry) => {
            console.log(`  ${entry.id}  ->  ${entry.reason}`);
        });
    }

    console.log("");
}

const plan = planUserProfileNameBackfill(await loadUsers());
report(plan, apply ? "apply" : "dry-run");

// Stop on the whole run, not just the unfixable profiles. Writing the fixable
// ones would report success while the rules would still refuse every closeout
// batch the remaining profiles take part in, and the operator would have to run
// this again anyway. One clear human fix, then one clean run.
if (plan.invalid.length > 0) {
    console.error(`Backfill stopped: ${plan.invalid.length} profile(s) cannot be fixed automatically.`);
    console.error("Nothing was written. Give each of the profiles listed above a first name, then re-run.");
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
