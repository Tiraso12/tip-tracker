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

// Seed a saved-but-not-settled shift (status "setup") so tests can exercise the
// read-only floor view + in-place edit without building a floor from scratch.
async function seedSetupShift(date) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, `shifts/${date}`), {
            date,
            status: "setup",
            teams: [{
                teamId: "team-1",
                members: [
                    { uid: "captainUid", name: "Captain One", role: "captain", points: 4 },
                    { uid: "serverUid", name: "Server One", role: "server", points: 4 },
                ],
                pools: { sales: "", tips: "", gratuity: "", cash: "" },
            }],
            barTeam: { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } },
            runners: [],
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
    await expect(page.getByRole("button", { name: /Bar Team/i })).toBeVisible();
}

// Assign a seeded pool employee to the currently selected team (click-to-assign).
async function assignFromPool(page, name) {
    await page.locator(`[title="Assign ${name} to selected team"]`).click();
}

// Setup-shift Settle up flow. Settle up lands LOCKED (the money form is visible but
// its fields are disabled); the floating Edit unlocks the same fields in place, Done
// saves and re-locks, and Calculate Payouts (available in the locked view) advances
// to Review.
async function settleMoneyAndReview(page, { sales, tips, gratuity, cash }) {
    const rail = page.getByRole("navigation", { name: "Day steps" });
    await rail.getByRole("button", { name: "Settle" }).click();

    // Unlock the same fields in place, enter the money, then save + re-lock with Done.
    await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Sales", exact: true }).fill(sales);
    await page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true }).fill(tips);
    await page.getByRole("spinbutton", { name: "Gratuity", exact: true }).fill(gratuity);
    await page.getByRole("spinbutton", { name: "Cash", exact: true }).fill(cash);
    await page.getByRole("button", { name: "✓ Done" }).click();
    await expect(page.getByRole("button", { name: "✎ Edit", exact: true })).toBeVisible();

    // Calculate Payouts advances to Review.
    await page.getByRole("button", { name: /Calculate Payouts/i }).click();
    await expect(page.getByRole("button", { name: "Confirm & Save Shift" })).toBeVisible();
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

    // ✓ Done saves the floor and returns to the read-only floor view.
    await page.getByRole("button", { name: "✓ Done" }).click();
    await expect(page.getByText("Floor plan is set")).toBeVisible();

    // Settle up mirrors the floor plan: open its read-only summary, edit the money in
    // place, save with Done, then Calculate Payouts to reach Review.
    await settleMoneyAndReview(page, { sales: "1000", tips: "200", gratuity: "100", cash: "50" });
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

    // ✓ Done saves the floor; Settle up mirrors the floor plan (summary -> Edit -> money
    // -> Done -> Calculate) to reach Review, then confirm to close the shift.
    await page.getByRole("button", { name: "✓ Done" }).click();
    await expect(page.getByText("Floor plan is set")).toBeVisible();
    await settleMoneyAndReview(page, { sales: "1000", tips: "300", gratuity: "150", cash: "80" });
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();

    // Reopen the settled shift via the floating "Edit shift" -> the SAME new in-place
    // editor (no old view-only / "Edit roster" gate). The floor is directly editable.
    await page.getByRole("button", { name: "Edit shift" }).click();
    await expect(page.getByRole("button", { name: /Bar Team/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit roster" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Back One" })).toBeVisible();
    await page.getByRole("button", { name: "Remove Back One" }).click();

    // The bare, non-merging "Save Team Setup" overwrite is not offered on a closed
    // shift; roster edits go through Settle up -> Calculate -> Confirm & Save.
    await expect(page.getByRole("button", { name: "Save Team Setup" })).toHaveCount(0);

    // Closed shift: Settle up lands locked; Calculate Payouts is available without
    // unlocking and routes into the overwrite-confirmed Review.
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

    test("floor view: Edit opens the in-place editor; Done returns to the floor view and stays on Floor", async ({ page }) => {
        const date = "2026-05-27";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        // Read-only floor view.
        await expect(page.getByText("Floor plan is set")).toBeVisible();
        const rail = page.getByRole("navigation", { name: "Day steps" });

        // Tapping "Floor" in the rail stays on the read-only view (does NOT open edit).
        await rail.getByRole("button", { name: "Floor" }).click();
        await expect(page.getByText("Floor plan is set")).toBeVisible();
        await expect(page.getByText("Editing floor plan")).toHaveCount(0);

        // Edit is entered ONLY via the floating button -> in-place editor.
        await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
        await expect(page.getByText("Editing floor plan")).toBeVisible();
        await expect(page.getByRole("button", { name: "Add restaurant team" })).toBeVisible();

        // ✓ Done returns to the read-only floor view and STAYS there (no jump to Settle).
        await page.getByRole("button", { name: "✓ Done" }).click();
        await expect(page.getByText("Floor plan is set")).toBeVisible();
        await expect(page.getByText("Editing floor plan")).toHaveCount(0);
        await expect(page.getByRole("tab", { name: /Team 1/ })).toHaveCount(0); // not the money step

        // Advancing to Settle shows the money screen (locked); the group switcher is
        // present and the floating Edit unlocks the fields in place.
        await rail.getByRole("button", { name: "Settle" }).click();
        await expect(page.getByRole("tab", { name: /Team 1/ })).toBeVisible();
        await expect(page.getByRole("button", { name: "✎ Edit", exact: true })).toBeVisible();
    });

    test("the day-step rail is Floor -> Settle -> Review with no Pay out step", async ({ page }) => {
        const date = "2026-05-26";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        const rail = page.getByRole("navigation", { name: "Day steps" });
        await expect(rail.getByRole("button", { name: "Floor" })).toBeVisible();
        await expect(rail.getByRole("button", { name: "Settle" })).toBeVisible();
        await expect(rail.getByRole("button", { name: "Review" })).toBeVisible();
        await expect(rail.getByRole("button", { name: /Pay out/i })).toHaveCount(0);
    });

    test("settled shift: rail hidden, floating Edit shift opens the new in-place editor, and saving shows the overwrite confirmation", async ({ page }) => {
        const date = "2026-05-28";
        await seedClosedShift(date);
        await login(page);
        await setShiftDate(page, date);

        // Settled landing: the step rail is hidden; editing is a floating button.
        await expect(page.getByRole("navigation", { name: "Day steps" })).toHaveCount(0);
        await page.getByRole("button", { name: "Edit shift" }).click();

        // The SAME new in-place editor - not the old view-only + "Edit roster" screen.
        await expect(page.getByText("Editing floor plan")).toBeVisible();
        await expect(page.getByRole("button", { name: "Edit roster" })).toHaveCount(0);
        await expect(page.getByText("The roster is view-only.")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Add restaurant team" })).toBeVisible();

        // The team card is directly editable: tap opens the assign sheet; add a member.
        await page.getByRole("button", { name: /Team 1/i }).click();
        const sheet = page.getByRole("dialog", { name: /Add employees to Team 1/i });
        await expect(sheet).toBeVisible();
        await sheet.locator('[title="Assign Back One to selected team"]').click();
        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // ✓ Done on a paid shift routes into the EXISTING overwrite-confirmed save; the
        // "Re-saving overwrites the saved payouts" warning + Confirm & Save appear
        // before anything is written (we stop here, so nothing is overwritten).
        await page.getByRole("button", { name: "✓ Done" }).click();
        await expect(page.getByText(/Re-saving overwrites the saved payouts/i)).toBeVisible();
        await expect(page.getByRole("button", { name: "Confirm & Save Shift" })).toBeVisible();
    });

    test("floor edit: Cancel leaves the in-place editor without saving and returns to the floor view", async ({ page }) => {
        const date = "2026-05-25";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        await expect(page.getByText("Floor plan is set")).toBeVisible();

        // Enter edit via the floating ✎ Edit, then Cancel with no changes -> straight
        // back to the read-only floor view (edit mode left, nothing committed).
        await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
        await expect(page.getByText("Editing floor plan")).toBeVisible();

        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByText("Floor plan is set")).toBeVisible();
        await expect(page.getByText("Editing floor plan")).toHaveCount(0);
    });

    test("closed shift edit: Cancel discards the in-progress roster change and keeps the saved shift", async ({ page }) => {
        const date = "2026-05-24";
        await seedClosedShift(date);

        // A closed shift disables draft autosave, so an in-progress roster edit only
        // persists through Confirm & Save. Cancel guards that with a discard confirm.
        page.on("dialog", (dialog) => dialog.accept());

        await login(page);
        await setShiftDate(page, date);

        await page.getByRole("button", { name: "Edit shift" }).click();
        await expect(page.getByText("Editing floor plan")).toBeVisible();

        // Add a member so there is an uncommitted change to discard.
        await page.getByRole("button", { name: /Team 1/i }).click();
        const sheet = page.getByRole("dialog", { name: /Add employees to Team 1/i });
        await expect(sheet).toBeVisible();
        await sheet.locator('[title="Assign Back One to selected team"]').click();
        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Cancel -> accept the discard -> back on the settled landing, nothing written.
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const shiftDoc = await getDoc(doc(db, `shifts/${date}`));
            const memberUids = shiftDoc.data().teams[0].members.map((member) => member.uid);
            expect(memberUids).toContain("captainUid");
            expect(memberUids).toContain("serverUid");
            expect(memberUids).not.toContain("backUid");
            const backPayout = await getDoc(doc(db, "payouts", date, "entries", "backUid"));
            expect(backPayout.exists()).toBe(false);
        });
    });

    test("Settle up lands locked: the money fields are disabled until Edit, and Done re-locks them in place", async ({ page }) => {
        const date = "2026-05-23";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        // Lands showing the REAL money fields, but locked (disabled) - not a separate
        // read-only representation.
        await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Settle" }).click();
        const sales = page.getByRole("spinbutton", { name: "Sales", exact: true });
        await expect(sales).toBeVisible();
        await expect(sales).toBeDisabled();
        await expect(page.getByText(/Editing · Settle up/)).toHaveCount(0);

        // Edit unlocks the very same fields in place.
        await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
        await expect(page.getByText(/Editing · Settle up/)).toBeVisible();
        await expect(sales).toBeEnabled();
        await sales.fill("500");

        // Done saves and re-locks in place (stays on Settle up; the value persists).
        await page.getByRole("button", { name: "✓ Done" }).click();
        await expect(page.getByText(/Editing · Settle up/)).toHaveCount(0);
        await expect(page.getByRole("spinbutton", { name: "Sales", exact: true })).toBeDisabled();
        await expect(page.getByRole("spinbutton", { name: "Sales", exact: true })).toHaveValue("500");
    });

    test("Settle up: Cancel discards the in-progress money edit and re-locks in place", async ({ page }) => {
        const date = "2026-05-22";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Settle" }).click();
        await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
        await expect(page.getByText(/Editing · Settle up/)).toBeVisible();
        const tips = page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true });
        await tips.fill("500");

        // Cancel discards the typed value (reverts to the pre-edit snapshot) and re-locks.
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByText(/Editing · Settle up/)).toHaveCount(0);
        await expect(page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true })).toBeDisabled();
        await expect(page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true })).toHaveValue("");
    });
});
