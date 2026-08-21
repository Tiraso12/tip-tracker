export const LIVE_ALLOW_FLAG = "TIP_TRACKER_ALLOW_LIVE_MIGRATION";
export const BACKUP_BUCKET_ENV = "TIP_TRACKER_BACKUP_BUCKET";

const APP_STORAGE_BUCKET = /\.(appspot\.com|firebasestorage\.app)$/;

export function resolveBackupProjectId(env = {}, firebasercDefault = null) {
    return env.FIREBASE_PROJECT_ID
        || env.GCLOUD_PROJECT
        || env.GOOGLE_CLOUD_PROJECT
        || firebasercDefault
        || null;
}

export function isEmulatorEnv(env = {}) {
    return Boolean(
        env.FIRESTORE_EMULATOR_HOST
        || env.FIREBASE_AUTH_EMULATOR_HOST
        || env.FIREBASE_EMULATOR_HUB,
    );
}

export function isDemoProjectId(projectId) {
    return typeof projectId === "string" && projectId.startsWith("demo-");
}

export function isAppStorageBucket(bucket) {
    return typeof bucket === "string" && APP_STORAGE_BUCKET.test(bucket);
}

export function parseBackupLocation(raw) {
    if (raw == null) {
        return { ok: false, reason: "missing" };
    }

    let value = String(raw).trim();
    if (value.startsWith("gs://")) {
        value = value.slice(5);
    }
    value = value.replace(/\/+$/, "");
    if (!value) {
        return { ok: false, reason: "missing" };
    }

    const [bucket, ...rest] = value.split("/").filter(Boolean);
    if (!bucket) {
        return { ok: false, reason: "missing" };
    }
    if (isAppStorageBucket(bucket)) {
        return { ok: false, reason: "app-bucket", bucket };
    }

    return {
        ok: true,
        bucket,
        prefix: rest.length > 0 ? rest.join("/") : "tip-tracker",
    };
}

export function formatBackupTimestamp(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

export function buildBackupPaths({ bucket, prefix, timestamp }) {
    const exportPrefix = `${prefix}/predeploy-${timestamp}`;
    return {
        timestamp,
        firestoreUri: `gs://${bucket}/${exportPrefix}`,
        authFileName: `auth-users-predeploy-${timestamp}.json`,
        authObjectUri: `gs://${bucket}/${exportPrefix}/auth-users-predeploy-${timestamp}.json`,
    };
}

export function planLiveBackup({
    env = {},
    firebasercDefault = null,
    now = new Date(),
} = {}) {
    if (isEmulatorEnv(env)) {
        return {
            ok: false,
            code: "emulator",
            message: "Refusing backup against the emulator. This command is for the live project only.",
        };
    }

    const projectId = resolveBackupProjectId(env, firebasercDefault);
    if (!projectId) {
        return {
            ok: false,
            code: "no-project",
            message: "No production project id. Set FIREBASE_PROJECT_ID or GCLOUD_PROJECT, or keep .firebaserc default pointed at live.",
        };
    }

    if (isDemoProjectId(projectId)) {
        return {
            ok: false,
            code: "demo-project",
            message: `Refusing backup against demo project ${projectId}. Point FIREBASE_PROJECT_ID at the live project.`,
        };
    }

    if (env[LIVE_ALLOW_FLAG] !== "true") {
        return {
            ok: false,
            code: "allow-flag",
            message: `Refusing live backup without ${LIVE_ALLOW_FLAG}=true.`,
        };
    }

    const location = parseBackupLocation(env[BACKUP_BUCKET_ENV]);
    if (!location.ok && location.reason === "app-bucket") {
        return {
            ok: false,
            code: "app-bucket",
            message: `Refusing the public Firebase app bucket ${location.bucket}. Create a locked Cloud Storage bucket (uniform access, no public ACLs) and set ${BACKUP_BUCKET_ENV} to that bucket name.`,
        };
    }
    if (!location.ok) {
        return {
            ok: false,
            code: "no-bucket",
            message: `No locked backup bucket configured. Create a Cloud Storage bucket that is not the public app bucket, grant the Firestore import/export service agent write access, then re-run with ${BACKUP_BUCKET_ENV}=<bucket-name>.`,
        };
    }

    const timestamp = formatBackupTimestamp(now);
    const paths = buildBackupPaths({
        bucket: location.bucket,
        prefix: location.prefix,
        timestamp,
    });

    return {
        ok: true,
        projectId,
        bucket: location.bucket,
        prefix: location.prefix,
        ...paths,
    };
}
