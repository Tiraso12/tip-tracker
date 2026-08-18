#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BACKUP_BUCKET_ENV, planLiveBackup } from "../src/utils/liveBackup.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const args = process.argv.slice(2);

if (args.some((arg) => ["--restore", "--apply", "--migrate", "--backfill", "--deploy"].includes(arg))) {
    console.error("backup:live only exports. It does not restore, migrate, backfill, or deploy.");
    process.exit(1);
}

function readFirebasercDefault() {
    try {
        const rc = JSON.parse(readFileSync(join(repoRoot, ".firebaserc"), "utf8"));
        return rc.projects?.default || null;
    } catch {
        return null;
    }
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

function runOrNextStep(command, commandArgs, nextStep) {
    const result = spawnSync(command, commandArgs, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.error?.code === "ENOENT") {
        fail(nextStep);
    }

    return result;
}

const plan = planLiveBackup({
    env: process.env,
    firebasercDefault: readFirebasercDefault(),
});

if (!plan.ok) {
    fail(plan.message);
}

const gcloudVersion = runOrNextStep(
    "gcloud",
    ["--version"],
    "gcloud is not installed. Install the Google Cloud SDK, run `gcloud auth login`, then re-run this command.",
);
if (gcloudVersion.status !== 0) {
    fail("gcloud is not usable. Next step: install/authenticate the Google Cloud SDK, then re-run.");
}

const bucketCheck = runOrNextStep(
    "gcloud",
    ["storage", "buckets", "describe", `gs://${plan.bucket}`, `--project=${plan.projectId}`, "--format=value(name)"],
    "gcloud is not installed. Install the Google Cloud SDK, run `gcloud auth login`, then re-run this command.",
);
if (bucketCheck.status !== 0) {
    const detail = (bucketCheck.stderr || bucketCheck.stdout || "").trim();
    if (detail) {
        console.error(detail);
    }
    fail(
        `Bucket ${plan.bucket} was not found or is not readable in project ${plan.projectId}. `
        + `Next step: create a locked Cloud Storage bucket (uniform access, no public ACLs), `
        + `grant the Firestore import/export service agent write access, then re-run with ${BACKUP_BUCKET_ENV}=<bucket-name>.`,
    );
}

const firebaseBin = join(repoRoot, "node_modules", ".bin", "firebase");
const firebaseVersion = runOrNextStep(
    firebaseBin,
    ["--version"],
    "firebase CLI is not installed in this repo. Next step: npm install, then re-run.",
);
if (firebaseVersion.status !== 0) {
    fail("firebase CLI is not usable. Next step: npm install, then `npx firebase login` if needed, then re-run.");
}

const backupsDir = join(repoRoot, "backups");
mkdirSync(backupsDir, { recursive: true });
const authLocalPath = join(backupsDir, plan.authFileName);

console.log(`Live backup starting against ${plan.projectId}`);
console.log(`  timestamp: ${plan.timestamp}`);
console.log(`  firestore destination: ${plan.firestoreUri}`);
console.log(`  auth destination:      ${authLocalPath}`);

const firestoreExport = spawnSync("gcloud", [
    "firestore",
    "export",
    plan.firestoreUri,
    `--project=${plan.projectId}`,
    "--database=(default)",
], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
});

if (firestoreExport.error?.code === "ENOENT") {
    fail("gcloud is not installed. Install the Google Cloud SDK, run `gcloud auth login`, then re-run this command.");
}
if (firestoreExport.status !== 0) {
    fail(
        `Firestore export failed. Nothing was restored or migrated. `
        + `Fix gcloud auth / bucket write access, then re-run. Destination was ${plan.firestoreUri}.`,
    );
}

const authExport = spawnSync(firebaseBin, [
    "auth:export",
    authLocalPath,
    "--format=json",
    `--project=${plan.projectId}`,
], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
});

if (authExport.error?.code === "ENOENT") {
    fail(
        `firebase CLI disappeared after the Firestore export. Auth users were not written. `
        + `Firestore export is at ${plan.firestoreUri}. Next step: npm install, then re-run for the Auth export.`,
    );
}
if (authExport.status !== 0) {
    fail(
        `Auth export failed after Firestore export finished. `
        + `Firestore export is at ${plan.firestoreUri}. `
        + `Next step: npx firebase login (or set GOOGLE_APPLICATION_CREDENTIALS), then re-run. `
        + `Do not start a live mutation until Auth users are also saved.`,
    );
}

console.log("");
console.log("Live backup complete.");
console.log(`  timestamp: ${plan.timestamp}`);
console.log(`  firestore: ${plan.firestoreUri}`);
console.log(`  auth:      ${authLocalPath}`);
console.log("This command does not restore, migrate, backfill names, or deploy.");
