import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

const PROJECT_ID = "demo-tip-tracker-test";
const ADMIN_EMAIL = "admin-temp-merge@example.com";
const ADMIN_PASSWORD = "Password123!";

// The Firebase CLI exports this for emulators:exec; fall back to the default auth port.
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

let testEnv;

async function createAuthUser({ email, password, displayName }) {
    const response = await fetch(
        `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                email,
                password,
                displayName,
                returnSecureToken: true,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to create auth user: ${await response.text()}`);
    }

    return response.json();
}

async function clearAuthUsers() {
    await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
        method: "DELETE",
    });
}

async function seedBaseUsers() {
    await testEnv.clearFirestore();
    await clearAuthUsers();

    const admin = await createAuthUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        displayName: "Admin",
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        await setDoc(doc(db, `users/${admin.localId}`), {
            uid: admin.localId,
            username: "Admin",
            email: ADMIN_EMAIL,
            role: "admin",
            status: "active",
        });

        await setDoc(doc(db, "users/emptyTargetUid"), {
            uid: "emptyTargetUid",
            username: "Empty Target",
            email: "empty@example.com",
            role: "server",
            status: "active",
            hasShiftHistory: false,
            hasTipHistory: false,
        });

        await setDoc(doc(db, "users/historyTargetUid"), {
            uid: "historyTargetUid",
            username: "History Target",
            email: "history@example.com",
            role: "server",
            status: "active",
            hasShiftHistory: true,
            hasTipHistory: true,
        });
    });
}

async function seedTempPayout({
    tempUid,
    tempName,
    date,
    targetUid = null,
    targetDate = null,
    targetTotal = 600,
}) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        await setDoc(doc(db, `unregisteredStaff/${tempUid}`), {
            uid: tempUid,
            name: tempName,
            role: "server",
        });

        await setDoc(doc(db, "payouts", date), {
            date,
            ledgerVersion: 1,
        });
        await setDoc(doc(db, "payouts", date, "entries", tempUid), {
            date,
            uid: tempUid,
            name: tempName,
            role: "server",
            tips: 120,
            gratuity: 30,
            cash: 10,
            total: 150,
            ledgerVersion: 1,
            source: "closeout",
        });
        await setDoc(doc(db, `shifts/${date}`), {
            date,
            status: "closed",
            teams: [{
                teamId: "team-1",
                members: [{ uid: tempUid, name: tempName, role: "server" }],
            }],
            barTeam: { members: [] },
            runners: [],
            summary: { balances: { overallBalance: 0 } },
        });

        if (targetUid && targetDate) {
            await setDoc(doc(db, "payouts", targetDate), {
                date: targetDate,
                ledgerVersion: 1,
            }, { merge: true });
            await setDoc(doc(db, "payouts", targetDate, "entries", targetUid), {
                date: targetDate,
                uid: targetUid,
                name: "History Target",
                role: "server",
                tips: targetTotal,
                gratuity: 0,
                cash: 0,
                total: targetTotal,
                ledgerVersion: 1,
                source: "closeout",
            });
        }
    });
}

async function loginAndOpenTeam(page) {
    await page.goto("/");

    await page.getByLabel("Username or Email").fill(ADMIN_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();

    // Landing (Shifts tab) is ready once the day-step spine renders; the Team
    // section lives in the workspace nav.
    await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Team Management" })).toBeVisible();
}

async function mergeTempProfile(page, { tempUid, tempName, targetUid }) {
    const dialogMessages = [];
    page.on("dialog", async (dialog) => {
        dialogMessages.push(dialog.message());
        await dialog.accept();
    });

    const row = page.getByTestId(`temp-staff-row-${tempUid}`);
    await row.getByLabel(`Merge ${tempName} into account`).selectOption(targetUid);
    await row.getByRole("button", { name: "Merge" }).click();
    await expect.poll(() => dialogMessages.length).toBe(2);
    return dialogMessages;
}

test.beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            rules: readFileSync("firestore.rules", "utf8"),
        },
    });
});

test.afterAll(async () => {
    await testEnv.cleanup();
});

test.beforeEach(async () => {
    await seedBaseUsers();
});

test("admin merges temp payout history into an empty account", async ({ page }) => {
    await seedTempPayout({
        tempUid: "tempEmptyMergeUid",
        tempName: "Temp Empty Merge",
        date: "2026-05-27",
    });

    await loginAndOpenTeam(page);
    const dialogMessages = await mergeTempProfile(page, {
        tempUid: "tempEmptyMergeUid",
        tempName: "Temp Empty Merge",
        targetUid: "emptyTargetUid",
    });

    expect(dialogMessages[1]).toContain("Temporary profile merged into the real account.");

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const targetPayout = await getDoc(doc(db, "payouts", "2026-05-27", "entries", "emptyTargetUid"));
        const tempPayout = await getDoc(doc(db, "payouts", "2026-05-27", "entries", "tempEmptyMergeUid"));
        const tempProfile = await getDoc(doc(db, "unregisteredStaff/tempEmptyMergeUid"));
        const shift = await getDoc(doc(db, "shifts/2026-05-27"));
        const auditEvents = await getDocs(collection(db, "auditEvents"));

        expect(targetPayout.exists()).toBe(true);
        expect(targetPayout.data()).toMatchObject({
            uid: "emptyTargetUid",
            name: "Empty Target",
            total: 150,
            source: "temp_staff_merge",
            mergedFromTempStaff: {
                uid: "tempEmptyMergeUid",
                name: "Temp Empty Merge",
                role: "server",
            },
        });
        expect(tempPayout.exists()).toBe(false);
        expect(tempProfile.exists()).toBe(false);
        expect(shift.data().teams[0].members[0]).toMatchObject({
            uid: "emptyTargetUid",
            name: "Empty Target",
        });
        expect(auditEvents.size).toBe(1);
        expect(auditEvents.docs[0].data()).toMatchObject({
            type: "temp_staff_merged",
            migratedDates: ["2026-05-27"],
            tempStaff: {
                uid: "tempEmptyMergeUid",
                name: "Temp Empty Merge",
                role: "server",
            },
            targetUser: {
                uid: "emptyTargetUid",
                username: "Empty Target",
            },
        });
    });
});

test("admin merges temp payout history into a non-empty account when dates do not collide", async ({ page }) => {
    await seedTempPayout({
        tempUid: "tempNoCollisionUid",
        tempName: "Temp No Collision",
        date: "2026-05-27",
        targetUid: "historyTargetUid",
        targetDate: "2026-05-26",
        targetTotal: 600,
    });

    await loginAndOpenTeam(page);
    const dialogMessages = await mergeTempProfile(page, {
        tempUid: "tempNoCollisionUid",
        tempName: "Temp No Collision",
        targetUid: "historyTargetUid",
    });

    expect(dialogMessages[1]).toContain("Temporary profile merged into the real account.");

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const existingTargetPayout = await getDoc(doc(db, "payouts", "2026-05-26", "entries", "historyTargetUid"));
        const migratedTargetPayout = await getDoc(doc(db, "payouts", "2026-05-27", "entries", "historyTargetUid"));
        const tempPayout = await getDoc(doc(db, "payouts", "2026-05-27", "entries", "tempNoCollisionUid"));
        const tempProfile = await getDoc(doc(db, "unregisteredStaff/tempNoCollisionUid"));

        expect(existingTargetPayout.exists()).toBe(true);
        expect(existingTargetPayout.data().total).toBe(600);
        expect(migratedTargetPayout.exists()).toBe(true);
        expect(migratedTargetPayout.data()).toMatchObject({
            uid: "historyTargetUid",
            total: 150,
            mergedFromTempStaff: {
                uid: "tempNoCollisionUid",
            },
        });
        expect(tempPayout.exists()).toBe(false);
        expect(tempProfile.exists()).toBe(false);
    });
});

test("same-date target payout collision is reported and preserves existing payroll data", async ({ page }) => {
    await seedTempPayout({
        tempUid: "tempCollisionUid",
        tempName: "Temp Collision",
        date: "2026-05-27",
        targetUid: "historyTargetUid",
        targetDate: "2026-05-27",
        targetTotal: 600,
    });

    await loginAndOpenTeam(page);
    const dialogMessages = await mergeTempProfile(page, {
        tempUid: "tempCollisionUid",
        tempName: "Temp Collision",
        targetUid: "historyTargetUid",
    });

    expect(dialogMessages[1]).toContain("Merge stopped.");
    expect(dialogMessages[1]).toContain("2026-05-27");

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const existingTargetPayout = await getDoc(doc(db, "payouts", "2026-05-27", "entries", "historyTargetUid"));
        const tempPayout = await getDoc(doc(db, "payouts", "2026-05-27", "entries", "tempCollisionUid"));
        const tempProfile = await getDoc(doc(db, "unregisteredStaff/tempCollisionUid"));
        const shift = await getDoc(doc(db, "shifts/2026-05-27"));
        const auditEvents = await getDocs(collection(db, "auditEvents"));

        expect(existingTargetPayout.exists()).toBe(true);
        expect(existingTargetPayout.data()).toMatchObject({
            uid: "historyTargetUid",
            total: 600,
            source: "closeout",
        });
        expect(tempPayout.exists()).toBe(true);
        expect(tempPayout.data()).toMatchObject({
            uid: "tempCollisionUid",
            total: 150,
            source: "closeout",
        });
        expect(tempProfile.exists()).toBe(true);
        expect(shift.data().teams[0].members[0]).toMatchObject({
            uid: "tempCollisionUid",
            name: "Temp Collision",
        });
        expect(auditEvents.size).toBe(0);
    });
});
