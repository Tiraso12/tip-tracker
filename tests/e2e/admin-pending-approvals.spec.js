import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

// The app bar's account avatar carries a count of people awaiting approval, for
// whoever can approve them. These specs hold the three things that make it worth
// having: the number is real and moves as people are approved/denied, it is
// absent at zero, and someone who cannot approve never sees it.

const PROJECT_ID = "demo-tip-tracker-test";
const ADMIN_EMAIL = "admin-approvals@example.com";
const SERVER_EMAIL = "server-approvals@example.com";
const PASSWORD = "Password123!";

const PHONE_VIEWPORT = { width: 390, height: 844 };

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

let testEnv;

async function createAuthUser({ email, password, displayName }) {
    const response = await fetch(
        `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
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

// Two people waiting, so the count is a count and not a boolean dot.
async function seedUsers({ pending = 2 } = {}) {
    await testEnv.clearFirestore();
    await clearAuthUsers();

    const admin = await createAuthUser({ email: ADMIN_EMAIL, password: PASSWORD, displayName: "Admin" });
    const server = await createAuthUser({ email: SERVER_EMAIL, password: PASSWORD, displayName: "Sam Server" });

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        await setDoc(doc(db, `users/${admin.localId}`), {
            uid: admin.localId,
            username: "Admin",
            email: ADMIN_EMAIL,
            role: "admin",
            status: "active",
        });

        await setDoc(doc(db, `users/${server.localId}`), {
            uid: server.localId,
            username: "Sam Server",
            email: SERVER_EMAIL,
            role: "server",
            status: "active",
        });

        for (let i = 0; i < pending; i += 1) {
            await setDoc(doc(db, `users/pendingUid${i}`), {
                uid: `pendingUid${i}`,
                username: `Pending ${i + 1}`,
                email: `pending${i + 1}@example.com`,
                // A role is already assigned, which is what makes Approve actionable.
                role: "server",
                status: "pending",
            });
        }
    });
}

async function login(page, email) {
    await page.goto("/");
    await page.getByLabel("Username or Email").fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
}

const badge = (page) => page.getByTestId("pending-approvals-badge");
const accountTrigger = (page) => page.getByRole("button", { name: /^Account:/ });

test.beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
});

test.afterAll(async () => {
    await testEnv.cleanup();
});

test("the count is real and clears as pending people are approved and denied", async ({ page }) => {
    await seedUsers({ pending: 2 });
    await login(page, ADMIN_EMAIL);

    await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();
    await expect(badge(page)).toHaveText("2");
    await expect(accountTrigger(page)).toHaveAccessibleName(/2 people awaiting approval/);

    // Tapping through lands on Team, where the two are actually acted on.
    await accountTrigger(page).click();
    await page.getByRole("menuitem", { name: /^Team/ }).click();
    await expect(page.getByRole("heading", { name: "Team Management" })).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());

    // Approve/Deny exist only on pending rows, so these are the two waiting people.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(2);
    await page.getByRole("button", { name: "Approve" }).first().click();
    await expect(badge(page)).toHaveText("1");
    await expect(accountTrigger(page)).toHaveAccessibleName(/1 person awaiting approval/);

    await page.getByRole("button", { name: "Deny" }).first().click();
    await expect(badge(page)).toHaveCount(0);
    await expect(accountTrigger(page)).toHaveAccessibleName(/Open account menu\.$/);
});

test("no badge renders when nobody is pending", async ({ page }) => {
    await seedUsers({ pending: 0 });
    await login(page, ADMIN_EMAIL);

    await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();
    await expect(accountTrigger(page)).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
});

test("someone who cannot approve accounts never sees the count", async ({ page }) => {
    await seedUsers({ pending: 2 });
    await login(page, SERVER_EMAIL);

    // An active server lands on their own dashboard: pending people exist, but
    // approving is not theirs, so neither the badge nor its screen is reachable.
    await expect(page.getByRole("heading", { name: "Tip Tracker" })).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Team", exact: true })).toHaveCount(0);
});

test("the badge does not disturb the phone app bar", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await seedUsers({ pending: 2 });
    await login(page, ADMIN_EMAIL);

    await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();
    await expect(badge(page)).toBeVisible();

    const bar = page.locator("header").first();
    const barBox = await bar.boundingBox();
    const triggerBox = await accountTrigger(page).boundingBox();

    // The bar keeps its single 56px row and the avatar its full 44x44 target.
    expect(barBox.height).toBe(56);
    expect(barBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
    expect(triggerBox.width).toBe(44);
    expect(triggerBox.height).toBe(44);
    // Nothing overflows the viewport sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        PHONE_VIEWPORT.width
    );

    // 320px is where this bar has always been tightest.
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(badge(page)).toBeVisible();
    const narrowBar = await bar.boundingBox();
    const narrowTrigger = await accountTrigger(page).boundingBox();
    expect(narrowBar.height).toBe(56);
    expect(narrowTrigger.width).toBe(44);
    expect(narrowTrigger.height).toBe(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    // The chip stays inside the bar's right inset instead of bleeding off-screen.
    const badgeBox = await badge(page).boundingBox();
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(320);
});
