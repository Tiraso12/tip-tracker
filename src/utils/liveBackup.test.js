import assert from "node:assert/strict";
import test from "node:test";

import {
    BACKUP_BUCKET_ENV,
    LIVE_ALLOW_FLAG,
    buildBackupPaths,
    formatBackupTimestamp,
    isAppStorageBucket,
    isDemoProjectId,
    isEmulatorEnv,
    parseBackupLocation,
    planLiveBackup,
    resolveBackupProjectId,
} from "./liveBackup.js";

const liveEnv = {
    [LIVE_ALLOW_FLAG]: "true",
    [BACKUP_BUCKET_ENV]: "tip-tracker-locked-backups",
    FIREBASE_PROJECT_ID: "tip-tracker-44de1",
};

test("resolveBackupProjectId prefers explicit env over .firebaserc", () => {
    assert.equal(
        resolveBackupProjectId({ FIREBASE_PROJECT_ID: "from-firebase" }, "from-rc"),
        "from-firebase",
    );
    assert.equal(
        resolveBackupProjectId({ GCLOUD_PROJECT: "from-gcloud" }, "from-rc"),
        "from-gcloud",
    );
    assert.equal(resolveBackupProjectId({}, "tip-tracker-44de1"), "tip-tracker-44de1");
    assert.equal(resolveBackupProjectId({}), null);
});

test("emulator host variables are treated as emulator, not live", () => {
    assert.equal(isEmulatorEnv({}), false);
    assert.equal(isEmulatorEnv({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8081" }), true);
    assert.equal(isEmulatorEnv({ FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }), true);
    assert.equal(isEmulatorEnv({ FIREBASE_EMULATOR_HUB: "127.0.0.1:4400" }), true);
});

test("demo project ids are refused", () => {
    assert.equal(isDemoProjectId("demo-tip-tracker-test"), true);
    assert.equal(isDemoProjectId("tip-tracker-44de1"), false);
});

test("the public Firebase app bucket is not a locked backup destination", () => {
    assert.equal(isAppStorageBucket("tip-tracker-44de1.appspot.com"), true);
    assert.equal(isAppStorageBucket("tip-tracker-44de1.firebasestorage.app"), true);
    assert.equal(isAppStorageBucket("tip-tracker-locked-backups"), false);
});

test("parseBackupLocation accepts a bucket or gs URI and defaults the prefix", () => {
    assert.deepEqual(parseBackupLocation("tip-tracker-locked-backups"), {
        ok: true,
        bucket: "tip-tracker-locked-backups",
        prefix: "tip-tracker",
    });
    assert.deepEqual(parseBackupLocation("gs://tip-tracker-locked-backups/go-live/"), {
        ok: true,
        bucket: "tip-tracker-locked-backups",
        prefix: "go-live",
    });
    assert.equal(parseBackupLocation("").ok, false);
    assert.equal(parseBackupLocation("gs://tip-tracker-44de1.appspot.com").reason, "app-bucket");
});

test("timestamps are UTC YYYYMMDD-HHMMSS", () => {
    assert.equal(formatBackupTimestamp(new Date("2026-08-17T14:30:22.123Z")), "20260817-143022");
});

test("export paths share one timestamp", () => {
    assert.deepEqual(buildBackupPaths({
        bucket: "locked",
        prefix: "tip-tracker",
        timestamp: "20260817-143022",
    }), {
        timestamp: "20260817-143022",
        firestoreUri: "gs://locked/tip-tracker/predeploy-20260817-143022",
        authFileName: "auth-users-predeploy-20260817-143022.json",
        authObjectUri: "gs://locked/tip-tracker/predeploy-20260817-143022/auth-users-predeploy-20260817-143022.json",
    });
});

test("planLiveBackup refuses emulator, demo, missing allow flag, and missing bucket", () => {
    assert.equal(planLiveBackup({
        env: { ...liveEnv, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8081" },
    }).code, "emulator");

    assert.equal(planLiveBackup({
        env: { ...liveEnv, FIREBASE_PROJECT_ID: "demo-tip-tracker-test" },
    }).code, "demo-project");

    const { [LIVE_ALLOW_FLAG]: _allow, ...withoutAllow } = liveEnv;
    assert.equal(planLiveBackup({ env: withoutAllow }).code, "allow-flag");

    const { [BACKUP_BUCKET_ENV]: _bucket, ...withoutBucket } = liveEnv;
    assert.equal(planLiveBackup({ env: withoutBucket }).code, "no-bucket");

    assert.equal(planLiveBackup({
        env: { ...liveEnv, [BACKUP_BUCKET_ENV]: "tip-tracker-44de1.appspot.com" },
    }).code, "app-bucket");
});

test("planLiveBackup prints a live export path when every gate passes", () => {
    const plan = planLiveBackup({
        env: liveEnv,
        now: new Date("2026-08-17T14:30:22.123Z"),
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.projectId, "tip-tracker-44de1");
    assert.equal(plan.timestamp, "20260817-143022");
    assert.equal(plan.firestoreUri, "gs://tip-tracker-locked-backups/tip-tracker/predeploy-20260817-143022");
    assert.equal(plan.authFileName, "auth-users-predeploy-20260817-143022.json");
});
