import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const PROJECT_ID = "demo-tip-tracker-test";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "Password123!";
const SHIFT_DATE = "2026-05-29";

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

test("admin can close out a simple dining room shift and create employee tip records", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Username or Email").fill(ADMIN_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();

    await expect(page.getByRole("heading", { name: "Shift Distribution" })).toBeVisible();
    await page.getByLabel("Select shift date").fill(SHIFT_DATE);
    await page.getByRole("button", { name: "Edit Shift" }).click();

    await page.getByRole("button", { name: /Team 1/i }).click();
    await page.getByText("Captain One").click();
    await page.getByText("Server One").click();
    await page.getByText("Back One").click();

    await page.getByRole("button", { name: "Save Team Setup" }).click();
    await expect(page.getByText("Team setup saved.").first()).toBeVisible();

    await page.getByRole("spinbutton", { name: "Sales ($)", exact: true }).fill("1000");
    await page.getByRole("spinbutton", { name: "Tips (CTP) ($)", exact: true }).first().fill("200");
    await page.getByRole("spinbutton", { name: "Gratuity ($)", exact: true }).first().fill("100");
    await page.getByRole("spinbutton", { name: "Cash ($)", exact: true }).fill("50");

    await page.getByRole("button", { name: "Calculate Payouts" }).click();
    await expect(page.getByText("Calculated payout review")).toBeVisible();
    await expect(page.getByText("Captain One").last()).toBeVisible();
    await expect(page.getByText("Server One").last()).toBeVisible();
    await expect(page.getByText("Back One").last()).toBeVisible();

    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    await expect(page.getByText("Saved.").first()).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const shiftDoc = await getDoc(doc(db, `shifts/${SHIFT_DATE}`));
        const captainTip = await getDoc(doc(db, `users/captainUid/tips/${SHIFT_DATE}`));
        const serverTip = await getDoc(doc(db, `users/serverUid/tips/${SHIFT_DATE}`));
        const backTip = await getDoc(doc(db, `users/backUid/tips/${SHIFT_DATE}`));

        expect(shiftDoc.exists()).toBe(true);
        expect(shiftDoc.data().status).toBe("closed");
        expect(Object.keys(shiftDoc.data().payouts)).toEqual(
            expect.arrayContaining(["captainUid", "serverUid", "backUid"])
        );
        expect(captainTip.exists()).toBe(true);
        expect(serverTip.exists()).toBe(true);
        expect(backTip.exists()).toBe(true);
    });
});

test("editing a closed shift's roster preserves payouts and cleans up the removed employee's tip doc", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Username or Email").fill(ADMIN_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();

    await expect(page.getByRole("heading", { name: "Shift Distribution" })).toBeVisible();
    await page.getByLabel("Select shift date").fill(SHIFT_DATE);
    await page.getByRole("button", { name: "Edit Shift" }).click();

    await page.getByRole("button", { name: /Team 1/i }).click();
    await page.getByText("Captain One").click();
    await page.getByText("Server One").click();
    await page.getByText("Back One").click();

    await page.getByRole("button", { name: "Save Team Setup" }).click();
    await expect(page.getByText("Team setup saved.").first()).toBeVisible();

    await page.getByRole("spinbutton", { name: "Sales ($)", exact: true }).fill("1000");
    await page.getByRole("spinbutton", { name: "Tips (CTP) ($)", exact: true }).first().fill("300");
    await page.getByRole("spinbutton", { name: "Gratuity ($)", exact: true }).first().fill("150");
    await page.getByRole("spinbutton", { name: "Cash ($)", exact: true }).fill("80");

    await page.getByRole("button", { name: "Calculate Payouts" }).click();
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    await expect(page.getByText("Saved.").first()).toBeVisible();

    // Reopen the now-closed, paid-out shift.
    await page.getByRole("button", { name: "Edit Shift" }).click();
    await expect(page.getByText("CLOSED SHIFT")).toBeVisible();

    // Expanding Team Floor Setup on a closed shift must warn before allowing roster edits.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Team Floor Setup/i }).click();

    // The bare, non-merging "Save Team Setup" overwrite must not be offered on a closed shift.
    await expect(page.getByRole("button", { name: "Save Team Setup" })).toHaveCount(0);

    await page.getByRole("button", { name: "Remove Back One" }).click();

    // Roster edits on a closed shift go through Calculate Payouts -> Confirm & Save Shift,
    // which correctly diffs and cleans up the removed employee's tip doc.
    await page.getByRole("button", { name: "Calculate Payouts" }).click();
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    await expect(page.getByText("Saved.").first()).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const shiftDoc = await getDoc(doc(db, `shifts/${SHIFT_DATE}`));
        const backTip = await getDoc(doc(db, `users/backUid/tips/${SHIFT_DATE}`));

        expect(shiftDoc.exists()).toBe(true);
        const shiftData = shiftDoc.data();
        expect(shiftData.status).toBe("closed");
        expect(shiftData).toHaveProperty("summary");
        expect(shiftData).toHaveProperty("closedAt");
        expect(Object.keys(shiftData.payouts)).toEqual(
            expect.arrayContaining(["captainUid", "serverUid"])
        );
        expect(shiftData.payouts).not.toHaveProperty("backUid");
        expect(backTip.exists()).toBe(false);
    });
});
