import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

const PROJECT_ID = "demo-tip-tracker-test";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "Password123!";
const SHIFT_DATE = "2026-05-29";
const MOBILE_VIEWPORT = { width: 390, height: 844 };

let testEnv;

async function createAuthUser({ email, password, displayName }) {
    const response = await fetch(
        `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
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
    await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, {
        method: "DELETE",
    });
}

async function seedCloseoutData() {
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

        await setDoc(doc(db, "users/captainUid"), {
            uid: "captainUid",
            username: "Captain One",
            email: "captain@example.com",
            role: "captain",
            status: "active",
        });

        await setDoc(doc(db, "users/serverUid"), {
            uid: "serverUid",
            username: "Server One",
            email: "server@example.com",
            role: "server",
            status: "active",
        });

        await setDoc(doc(db, "users/backUid"), {
            uid: "backUid",
            username: "Back One",
            email: "back@example.com",
            role: "back",
            status: "active",
        });
    });
}

// Seed an already closed & paid-out shift so tests can exercise the reopen flow
// without re-running a full closeout.
async function seedClosedShift(date) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        await setDoc(doc(db, `shifts/${date}`), {
            date,
            status: "closed",
            teams: [{
                teamId: "team-1",
                members: [
                    { uid: "captainUid", name: "Captain One", role: "captain", points: 4 },
                    { uid: "serverUid", name: "Server One", role: "server", points: 4 },
                ],
                pools: { sales: "1000", tips: "200", gratuity: "100", cash: "50" },
            }],
            barTeam: { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } },
            runners: [],
            summary: { balances: { overallBalance: 0 } },
            firstClosedAt: "2026-05-20T12:00:00.000Z",
        });
        await setDoc(doc(db, "payouts", date), { date, ledgerVersion: 1 });
        await setDoc(doc(db, "payouts", date, "entries", "captainUid"), {
            date, uid: "captainUid", name: "Captain One", role: "captain",
            tips: 184, gratuity: 57.6, cash: 38.4, total: 280, ledgerVersion: 1, source: "closeout",
        });
    });
}

// The Shifts-tab date lives in the app bar as an overlaid native date input
// (BarDatePill). It is aria-hidden and pointer-events-none by design, so drive it
// by setting its value directly and firing the change the pill listens for.
async function setShiftDate(page, date) {
    await page.locator('input[type="date"]').first().evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }, date);
}

async function login(page) {
    await page.goto("/");
    await page.getByLabel("Username or Email").fill(ADMIN_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    // Landing (Shifts tab) is ready once the day-step spine renders.
    await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();
}

// Open the shift editor from the Shifts landing: a fresh day offers "Build floor
// plan", a saved/closed day offers "Edit shift".
async function openEditor(page) {
    const build = page.getByRole("button", { name: /Build floor plan/i });
    const edit = page.getByRole("button", { name: "Edit shift" });
    // Wait out the landing's loading window before deciding which entry to click.
    await expect(build.or(edit)).toBeVisible();
    if (await build.count()) {
        await build.click();
    } else {
        await edit.click();
    }
    await expect(page.getByRole("heading", { name: "Floor plan" })).toBeVisible();
}

// Assign a seeded pool employee to the currently selected team (click-to-assign).
async function assignFromPool(page, name) {
    await page.locator(`[title="Assign ${name} to selected team"]`).click();
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
    await seedCloseoutData();
});

test("admin can close out a simple dining room shift and create ledger payout records", async ({ page }) => {
    await login(page);
    await setShiftDate(page, SHIFT_DATE);
    await openEditor(page);

    // Floor plan: select Team 1, then click-to-assign three dining employees.
    await page.getByRole("button", { name: /Team 1/i }).click();
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    await assignFromPool(page, "Back One");

    await page.getByRole("button", { name: /continue to Settle up/i }).click();
    await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible();

    // Settle up: enter the dining team's end-of-service money.
    await page.getByRole("spinbutton", { name: "Sales", exact: true }).fill("1000");
    await page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true }).fill("200");
    await page.getByRole("spinbutton", { name: "Gratuity", exact: true }).fill("100");
    await page.getByRole("spinbutton", { name: "Cash", exact: true }).fill("50");

    await page.getByRole("button", { name: /Calculate Payouts/i }).click();
    await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
    await expect(page.getByText("Captain One").last()).toBeVisible();
    await expect(page.getByText("Server One").last()).toBeVisible();
    await expect(page.getByText("Back One").last()).toBeVisible();

    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    // On save the editor returns to the paid-out landing (unique Export PDF action).
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const shiftDoc = await getDoc(doc(db, `shifts/${SHIFT_DATE}`));
        const captainPayout = await getDoc(doc(db, "payouts", SHIFT_DATE, "entries", "captainUid"));
        const serverPayout = await getDoc(doc(db, "payouts", SHIFT_DATE, "entries", "serverUid"));
        const backPayout = await getDoc(doc(db, "payouts", SHIFT_DATE, "entries", "backUid"));
        const captainTip = await getDoc(doc(db, `users/captainUid/tips/${SHIFT_DATE}`));
        const auditEvents = await getDocs(collection(db, "auditEvents"));

        expect(shiftDoc.exists()).toBe(true);
        expect(shiftDoc.data().status).toBe("closed");
        expect(shiftDoc.data()).not.toHaveProperty("payouts");
        expect(shiftDoc.data().summary).not.toHaveProperty("payouts");
        expect(shiftDoc.data()).toHaveProperty("firstClosedAt");
        expect(shiftDoc.data()).toHaveProperty("lastRecalculatedAt");
        expect(shiftDoc.data()).toHaveProperty("operationId");
        expect(captainPayout.exists()).toBe(true);
        expect(serverPayout.exists()).toBe(true);
        expect(backPayout.exists()).toBe(true);
        expect(captainTip.exists()).toBe(false);
        expect(auditEvents.size).toBe(1);
    });
});

test("editing a closed shift's roster preserves payouts and cleans up the removed employee's ledger entry", async ({ page }) => {
    await login(page);
    await setShiftDate(page, SHIFT_DATE);
    await openEditor(page);

    await page.getByRole("button", { name: /Team 1/i }).click();
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    await assignFromPool(page, "Back One");

    await page.getByRole("button", { name: /continue to Settle up/i }).click();
    await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible();

    await page.getByRole("spinbutton", { name: "Sales", exact: true }).fill("1000");
    await page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true }).fill("300");
    await page.getByRole("spinbutton", { name: "Gratuity", exact: true }).fill("150");
    await page.getByRole("spinbutton", { name: "Cash", exact: true }).fill("80");

    await page.getByRole("button", { name: /Calculate Payouts/i }).click();
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();

    // Reopen the now-closed, paid-out shift.
    await page.getByRole("button", { name: "Edit shift" }).click();
    await expect(page.getByText(/Closed shift/i).first()).toBeVisible();

    // On desktop the closed-shift floor stays directly editable; remove Back One.
    await page.getByRole("button", { name: "Remove Back One" }).click();

    // The bare, non-merging "Save Team Setup" overwrite is not offered on a closed
    // shift; roster edits go through Settle up -> Calculate -> Confirm & Save.
    await expect(page.getByRole("button", { name: "Save Team Setup" })).toHaveCount(0);

    await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Settle" }).click();
    await page.getByRole("button", { name: /Calculate Payouts/i }).click();
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const shiftDoc = await getDoc(doc(db, `shifts/${SHIFT_DATE}`));
        const backPayout = await getDoc(doc(db, "payouts", SHIFT_DATE, "entries", "backUid"));
        const captainPayout = await getDoc(doc(db, "payouts", SHIFT_DATE, "entries", "captainUid"));
        const serverPayout = await getDoc(doc(db, "payouts", SHIFT_DATE, "entries", "serverUid"));
        const auditEvents = await getDocs(collection(db, "auditEvents"));

        expect(shiftDoc.exists()).toBe(true);
        const shiftData = shiftDoc.data();
        expect(shiftData.status).toBe("closed");
        expect(shiftData).toHaveProperty("summary");
        expect(shiftData.summary).not.toHaveProperty("payouts");
        expect(shiftData).toHaveProperty("closedAt");
        expect(shiftData).toHaveProperty("firstClosedAt");
        expect(shiftData.closedAt).toBe(shiftData.firstClosedAt);
        expect(captainPayout.exists()).toBe(true);
        expect(serverPayout.exists()).toBe(true);
        expect(backPayout.exists()).toBe(false);
        expect(auditEvents.size).toBe(2);
    });
});

// Mobile-only floor polish regressions (viewport 390x844).
test.describe("mobile floor polish", () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test("F2: closing the assign sheet clears selection so a single tap reopens the team", async ({ page }) => {
        const date = "2026-05-30";
        await login(page);
        await setShiftDate(page, date);
        await openEditor(page);

        // Tapping the whole card opens the bottom-sheet picker (F1).
        await page.getByRole("button", { name: /Team 1/i }).click();
        const sheet = page.getByRole("dialog", { name: /Add employees to Team 1/i });
        await expect(sheet).toBeVisible();

        // Assign a member, then close the sheet with Done.
        await sheet.locator('[title="Assign Captain One to selected team"]').click();
        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Regression: before the fix the selection lingered, so this first tap only
        // silently deselected and the sheet stayed closed (it took a second tap).
        await page.getByRole("button", { name: /Team 1/i }).click();
        await expect(page.getByRole("dialog", { name: /Add employees to Team 1/i })).toBeVisible();
    });

    test("F10: a closed shift's floor is view-only until Edit roster is tapped", async ({ page }) => {
        const date = "2026-05-28";
        await seedClosedShift(date);

        await login(page);
        await setShiftDate(page, date);
        await page.getByRole("button", { name: "Edit shift" }).click();
        await expect(page.getByRole("heading", { name: "Floor plan" })).toBeVisible();

        // View-only by default: the Edit roster affordance is shown, the team
        // card is inert (disabled, opens no picker), and the stepper is hidden.
        await expect(page.getByText("The roster is view-only.")).toBeVisible();
        const editRoster = page.getByRole("button", { name: "Edit roster" });
        await expect(editRoster).toBeVisible();
        await expect(page.getByRole("button", { name: "Add restaurant team" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: /Team 1/i })).toBeDisabled();
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Opting into editing routes the admin through Settle up -> Confirm & Save
        // and re-enables the floor.
        await editRoster.click();
        await expect(page.getByRole("button", { name: /Continue to Settle up/i })).toBeVisible();
        await expect(page.getByRole("button", { name: "Add restaurant team" })).toBeVisible();

        await page.getByRole("button", { name: /Team 1/i }).click();
        await expect(page.getByRole("dialog", { name: /Add employees to Team 1/i })).toBeVisible();
    });
});
