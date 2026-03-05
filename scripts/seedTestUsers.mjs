/**
 * seedTestUsers.mjs
 * One-time script to create test users in Firebase for local testing.
 * Run with: node scripts/seedTestUsers.mjs
 *
 * Creates:
 *   1 admin  → test.admin@tiptracker.test / TestAdmin123!
 *  18 employees → test.emp1..18@tiptracker.test / TestEmp123!
 *
 * Safe to run multiple times — skips users that already exist.
 */

import { readFileSync } from "fs";
import { initializeApp } from "firebase/app";
import {
    getAuth,
    createUserWithEmailAndPassword,
    updateProfile,
    fetchSignInMethodsForEmail,
} from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ── Read .env.local ──────────────────────────────────────────────────────────
const envRaw = readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
    envRaw
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => l.trim().split("="))
        .map(([k, ...v]) => [k.trim(), v.join("=").trim()])
);

const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Test users to create ─────────────────────────────────────────────────────
const TEST_PASSWORD_ADMIN = "TestAdmin123!";
const TEST_PASSWORD_EMP = "TestEmp123!";

const users = [
    // Admin
    {
        email: "test.admin@tiptracker.test",
        password: TEST_PASSWORD_ADMIN,
        username: "test-admin",
        role: "admin",
    },

    // 3 Captains
    { email: "test.captain1@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-captain1", role: "employee" },
    { email: "test.captain2@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-captain2", role: "employee" },
    { email: "test.captain3@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-captain3", role: "employee" },

    // 3 Servers
    { email: "test.server1@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-server1", role: "employee" },
    { email: "test.server2@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-server2", role: "employee" },
    { email: "test.server3@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-server3", role: "employee" },

    // 3 B Servers
    { email: "test.bserver1@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-bserver1", role: "employee" },
    { email: "test.bserver2@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-bserver2", role: "employee" },
    { email: "test.bserver3@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-bserver3", role: "employee" },

    // 3 A Servers
    { email: "test.aserver1@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-aserver1", role: "employee" },
    { email: "test.aserver2@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-aserver2", role: "employee" },
    { email: "test.aserver3@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-aserver3", role: "employee" },

    // 3 Bartenders
    { email: "test.bar1@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-bar1", role: "employee" },
    { email: "test.bar2@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-bar2", role: "employee" },
    { email: "test.bar3@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-bar3", role: "employee" },

    // 3 Runners
    { email: "test.runner1@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-runner1", role: "employee" },
    { email: "test.runner2@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-runner2", role: "employee" },
    { email: "test.runner3@tiptracker.test", password: TEST_PASSWORD_EMP, username: "test-runner3", role: "employee" },
];

// ── Create users ─────────────────────────────────────────────────────────────
async function createUser({ email, password, username, role }) {
    // Check if already exists in Firestore by username
    // (Auth doesn't have a direct "check if exists" without trying)
    try {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        if (methods.length > 0) {
            console.log(`  ⏭  Skipping ${email} (already exists)`);
            return;
        }
    } catch (_) {
        // fetchSignInMethods may throw if email is invalid format — continue
    }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: username });
        await setDoc(doc(db, "users", cred.user.uid), {
            uid: cred.user.uid,
            username,
            email,
            role,
            isTestUser: true,              // flag so you can find/delete them easily
            createdAt: new Date().toISOString(),
        });
        console.log(`  ✅  Created ${role.padEnd(8)} → ${username} (${email})`);
    } catch (err) {
        if (err.code === "auth/email-already-in-use") {
            console.log(`  ⏭  Skipping ${email} (auth already exists)`);
        } else {
            console.error(`  ❌  Failed ${email}: ${err.message}`);
        }
    }
}

async function main() {
    console.log(`\n🔧  Seeding ${users.length} test users into project: ${firebaseConfig.projectId}\n`);
    for (const user of users) {
        await createUser(user);
    }
    console.log("\n✅  Done! All test users processed.\n");
    console.log("─────────────────────────────────────────────────");
    console.log("  Admin login:");
    console.log("    Email:    test.admin@tiptracker.test");
    console.log("    Password: TestAdmin123!");
    console.log("\n  Employee login (example):");
    console.log("    Email:    test.captain1@tiptracker.test");
    console.log("    Password: TestEmp123!");
    console.log("─────────────────────────────────────────────────\n");
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
