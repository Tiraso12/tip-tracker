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

        await setDoc(doc(db, "users/backStaffUid"), {
            uid: "backStaffUid",
            username: "Back Staff",
            email: "back@example.com",
            role: "back",
            status: "active",
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

// A saved-but-not-settled floor plan (status "setup") carrying the temp profile.
// This is the shape that used to survive a "successful" merge: no payouts and no
// ledger entries, so nothing discovered it and nothing rewrote it.
async function seedUnsettledShiftWithTempStaff({ tempUid, tempName, date }) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        await setDoc(doc(db, `unregisteredStaff/${tempUid}`), {
            uid: tempUid,
            name: tempName,
            role: "server",
        });

        await setDoc(doc(db, `shifts/${date}`), {
            date,
            status: "setup",
            teams: [{
                teamId: "team-1",
                members: [
                    { uid: "historyTargetUid", name: "History Target", role: "captain", points: 4 },
                    { uid: "backStaffUid", name: "Back Staff", role: "back", points: 2.5 },
                    { uid: tempUid, name: tempName, role: "server", points: 4 },
                ],
                pools: { sales: "", tips: "", gratuity: "", cash: "" },
            }],
            barTeam: { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } },
            runners: [],
            updatedAt: "2026-05-25T12:00:00.000Z",
        });
    });
}

// The Shifts-tab date lives in the app bar as an overlaid native date input
// (BarDatePill), aria-hidden by design, so drive it by setting its value directly.
async function setShiftDate(page, date) {
    await page.locator('input[type="date"]').first().evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }, date);
}

// Walk the saved floor plan through Settle up -> Review -> Confirm & Save, the way
// a manager settles the night after the merge happened.
async function settleSavedShift(page, { sales, tips, gratuity, cash }) {
    // A saved-but-unsettled day lands on the read-only floor view; the rail's Settle
    // pill opens the money screen (locked), and the floating Edit unlocks it in place.
    await expect(page.getByText("Floor plan is set")).toBeVisible();

    const rail = page.getByRole("navigation", { name: "Day steps" });
    await rail.getByRole("button", { name: "Settle" }).click();
    await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Sales", exact: true }).fill(sales);
    await page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true }).fill(tips);
    await page.getByRole("spinbutton", { name: "Gratuity", exact: true }).fill(gratuity);
    await page.getByRole("spinbutton", { name: "Cash", exact: true }).fill(cash);
    await page.getByRole("button", { name: "✓ Done" }).click();
    await expect(page.getByRole("button", { name: "✎ Edit", exact: true })).toBeVisible();

    await rail.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
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
    await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
}

async function mergeTempProfile(page, { tempUid, tempName, targetUid }) {
    const dialogMessages = [];
    page.on("dialog", async (dialog) => {
        dialogMessages.push(dialog.message());
        await dialog.accept();
    });

    await page.getByTestId(`roster-row-${tempUid}`).click();
    await page.getByLabel(`Merge ${tempName} into account`).selectOption(targetUid);
    await page.getByRole("button", { name: "Merge profile" }).click();
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

    expect(dialogMessages[1]).toContain("Temporary profile merged into Empty Target.");

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

    expect(dialogMessages[1]).toContain("Temporary profile merged into History Target.");

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

// The money-losing case: the temp profile sits on a floor plan that has not been
// settled yet. It carries no payouts and no ledger entries, so the merge used to
// leave it on the roster while deleting the profile - and settling that night
// afterwards paid a UID with no profile anywhere in the app.
test("merging a temp profile that is on an unsettled shift never pays a deleted profile", async ({ page }) => {
    const TEMP_UID = "tempUnsettledUid";
    const SHIFT_DATE = "2026-06-01";

    await seedUnsettledShiftWithTempStaff({
        tempUid: TEMP_UID,
        tempName: "Temp Unsettled",
        date: SHIFT_DATE,
    });

    await loginAndOpenTeam(page);
    const dialogMessages = await mergeTempProfile(page, {
        tempUid: TEMP_UID,
        tempName: "Temp Unsettled",
        targetUid: "emptyTargetUid",
    });

    // The manager is told what actually moved: no saved pay, one floor plan rewritten.
    expect(dialogMessages[1]).toContain("Temporary profile merged into Empty Target.");
    expect(dialogMessages[1]).toContain("No saved payout history to move.");
    expect(dialogMessages[1]).toContain(`Floor plan updated, with no payout saved yet: ${SHIFT_DATE}.`);

    // The floor plan no longer lists the temporary profile.
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const shift = await getDoc(doc(db, `shifts/${SHIFT_DATE}`));
        const members = shift.data().teams[0].members;

        expect(members.map(member => member.uid)).not.toContain(TEMP_UID);
        expect(members).toContainEqual(expect.objectContaining({
            uid: "emptyTargetUid",
            name: "Empty Target",
        }));
        expect((await getDoc(doc(db, `unregisteredStaff/${TEMP_UID}`))).exists()).toBe(false);
    });

    // Settle that night the normal way and check where the money landed.
    await page.getByRole("button", { name: "Shifts", exact: true }).click();
    await setShiftDate(page, SHIFT_DATE);
    await settleSavedShift(page, { sales: "1000", tips: "200", gratuity: "100", cash: "50" });

    await expect.poll(async () => {
        let uids = [];
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const entries = await getDocs(collection(db, "payouts", SHIFT_DATE, "entries"));
            uids = entries.docs.map(entry => entry.id).sort();
        });
        return uids;
    }).toEqual(["backStaffUid", "emptyTargetUid", "historyTargetUid"]);

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const entries = await getDocs(collection(db, "payouts", SHIFT_DATE, "entries"));

        // Every paid UID resolves to a real account - nobody is paid into a void.
        for (const entry of entries.docs) {
            const owner = await getDoc(doc(db, "users", entry.id));
            expect(owner.exists()).toBe(true);
        }
        expect((await getDoc(doc(db, `unregisteredStaff/${TEMP_UID}`))).exists()).toBe(false);
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
