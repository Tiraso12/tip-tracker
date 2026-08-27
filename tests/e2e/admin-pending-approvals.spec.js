import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

// The app bar's account avatar carries a count of people awaiting approval, for
// whoever can approve them. These specs hold the three things that make it worth
// having: the number is real and moves as people are approved/denied, it is
// absent at zero, and someone who cannot approve never sees it.

const PROJECT_ID = "demo-tip-tracker-test";
const ADMIN_EMAIL = "admin-approvals@example.com";
const SERVER_EMAIL = "server-approvals@example.com";
const PASSWORD = "Password123!";

const PHONE_VIEWPORT = { width: 390, height: 844 };
const SUPPORTED_PHONE_VIEWPORTS = [
    { width: 402, height: 874 },
    { width: 440, height: 956 },
];

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
            firstName: "Admin",
            lastName: "",
            email: ADMIN_EMAIL,
            role: "admin",
            status: "active",
        });

        await setDoc(doc(db, `users/${server.localId}`), {
            uid: server.localId,
            username: "Sam Server",
            firstName: "Sam Server",
            lastName: "",
            email: SERVER_EMAIL,
            role: "server",
            status: "active",
        });

        for (let i = 0; i < pending; i += 1) {
            await setDoc(doc(db, `users/pendingUid${i}`), {
                uid: `pendingUid${i}`,
                username: `Pending ${i + 1}`,
                firstName: `Pending ${i + 1}`,
                lastName: "",
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
// The app bar's account button: present at every width and on every day stage,
// so it is what these tests wait on to know the app is up. The Day steps rail
// is not - it is hidden on a landing with no floor plan yet (DayRailLanding).
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

    await expect(accountTrigger(page)).toBeVisible();
    await expect(badge(page)).toHaveText("2");
    await expect(accountTrigger(page)).toHaveAccessibleName(/2 people awaiting approval/);

    // Tapping through lands on Team, where the two are actually acted on.
    await accountTrigger(page).click();
    await page.getByRole("menuitem", { name: /^Team/ }).click();
    await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());

    // Pending people stay at the top of the roster. Their actions live inside
    // the person view, so no manager control is repeated on every row.
    await page.getByRole("button", { name: /Open Pending 1/ }).click();
    await page.getByRole("button", { name: "Approve account" }).click();
    await expect(badge(page)).toHaveText("1");
    await expect(accountTrigger(page)).toHaveAccessibleName(/1 person awaiting approval/);

    await page.getByRole("button", { name: "Back to team roster" }).click();
    await page.getByRole("button", { name: /Open Pending 2/ }).click();
    await page.getByRole("button", { name: "Deny request" }).click();
    await expect(badge(page)).toHaveCount(0);
    await expect(accountTrigger(page)).toHaveAccessibleName(/Open account menu\.$/);
});

test("no badge renders when nobody is pending", async ({ page }) => {
    await seedUsers({ pending: 0 });
    await login(page, ADMIN_EMAIL);

    await expect(accountTrigger(page)).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
});

test("someone who cannot approve accounts never sees the count", async ({ page }) => {
    await seedUsers({ pending: 2 });
    await login(page, SERVER_EMAIL);

    // An active server lands on their own pay: pending people exist, but
    // approving is not theirs, so neither the badge nor its screen is reachable.
    // The bar they now share with the workspace must not leak the count.
    await expect(page.getByTestId("pay-statement")).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Team", exact: true })).toHaveCount(0);
});

test("sign-up stores a work name separately from the login handle", async ({ page }) => {
    await seedUsers({ pending: 0 });
    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Last name (optional)")).toBeVisible();
    await expect(page.getByLabel("Login handle")).toBeVisible();

    await page.getByLabel("Email").fill("sonia-signup@example.com");
    await page.getByLabel("First name").fill("Sonia");
    await page.getByLabel("Last name (optional)").fill("Alvarez Garcia");
    await page.getByLabel("Login handle").fill("sonia-login");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.getByRole("heading", { name: "Account Pending" })).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const users = await getDocs(collection(db, "users"));
        const profile = users.docs.find((userDoc) => userDoc.data().email === "sonia-signup@example.com");
        expect(profile?.data()).toMatchObject({
            username: "sonia-login",
            firstName: "Sonia",
            lastName: "Alvarez Garcia",
            role: "unassigned",
            status: "pending",
        });

        const mapping = await getDoc(doc(db, "usernames/sonia-login"));
        expect(mapping.data()).toMatchObject({
            uid: profile.id,
            username: "sonia-login",
            email: "sonia-signup@example.com",
        });
    });

    const signIn = await fetch(
        `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                email: "sonia-signup@example.com",
                password: PASSWORD,
                returnSecureToken: true,
            }),
        }
    ).then((response) => response.json());
    const lookup = await fetch(
        `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-api-key`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idToken: signIn.idToken }),
        }
    ).then((response) => response.json());
    const [authUser] = lookup.users;
    expect(authUser.displayName).toBeUndefined();

    await page.getByRole("button", { name: "Log Out" }).click();
    await page.getByLabel("Username or Email").fill("sonia-login");
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("heading", { name: "Account Pending" })).toBeVisible();
});

test("sign-up stores the pending staff card when the email has capital letters", async ({ page }) => {
    await seedUsers({ pending: 0 });
    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();

    await page.getByLabel("Email").fill("AlexieKBrown@Gmail.com");
    await page.getByLabel("First name").fill("Alexie");
    await page.getByLabel("Last name (optional)").fill("Brown");
    await page.getByLabel("Login handle").fill("alexiebrown");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.getByRole("heading", { name: "Account Pending" })).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const users = await getDocs(collection(db, "users"));
        const profile = users.docs.find((userDoc) => userDoc.data().email === "alexiekbrown@gmail.com");
        expect(profile?.data()).toMatchObject({
            username: "alexiebrown",
            firstName: "Alexie",
            lastName: "Brown",
            role: "unassigned",
            status: "pending",
        });

        const mapping = await getDoc(doc(db, "usernames/alexiebrown"));
        expect(mapping.data()).toMatchObject({
            uid: profile.id,
            username: "alexiebrown",
            email: "alexiekbrown@gmail.com",
        });
    });
});

test("sign-up can repair an Auth-only orphan into a pending staff card", async ({ page }) => {
    await seedUsers({ pending: 0 });
    await createAuthUser({
        email: "orphan-signup@example.com",
        password: PASSWORD,
        displayName: "Orphan Signup",
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.getByLabel("Email").fill("orphan-signup@example.com");
    await page.getByLabel("First name").fill("Orla");
    await page.getByLabel("Last name (optional)").fill("Pending");
    await page.getByLabel("Login handle").fill("orla-pending");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.getByRole("heading", { name: "Account Pending" })).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const users = await getDocs(collection(db, "users"));
        const profile = users.docs.find((userDoc) => userDoc.data().email === "orphan-signup@example.com");
        expect(profile?.data()).toMatchObject({
            username: "orla-pending",
            firstName: "Orla",
            lastName: "Pending",
            role: "unassigned",
            status: "pending",
        });

        const mapping = await getDoc(doc(db, "usernames/orla-pending"));
        expect(mapping.data()).toMatchObject({
            uid: profile.id,
            username: "orla-pending",
            email: "orphan-signup@example.com",
        });
    });
});

// Signing up over an Auth-only orphan with the WRONG password used to report "An
// account with this email already exists. Log in or reset your password." Both
// suggested actions dead-end: logging in as an orphan is signed straight back out
// with nothing on screen. The message must name the one sequence that works.
test("sign-up over an orphan with the wrong password names the reset-then-sign-up recovery", async ({ page }) => {
    await seedUsers({ pending: 0 });
    await createAuthUser({
        email: "orphan-mismatch@example.com",
        password: PASSWORD,
        displayName: "Orphan Mismatch",
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.getByLabel("Email").fill("orphan-mismatch@example.com");
    await page.getByLabel("First name").fill("Orla");
    await page.getByLabel("Last name (optional)").fill("Mismatch");
    await page.getByLabel("Login handle").fill("orla-mismatch");
    await page.getByLabel("Password", { exact: true }).fill(`${PASSWORD}-wrong`);
    await page.getByLabel("Confirm Password").fill(`${PASSWORD}-wrong`);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.getByText(/that password does not match it/i)).toBeVisible();
    await expect(page.getByText(/reset it and sign up again/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account Pending" })).toBeHidden();

    // The refused attempt leaves the orphan exactly as it was - no half-written
    // profile, and the handle it asked for is still free.
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const users = await getDocs(collection(db, "users"));
        const profile = users.docs.find((userDoc) => userDoc.data().email === "orphan-mismatch@example.com");
        expect(profile).toBeUndefined();

        const mapping = await getDoc(doc(db, "usernames/orla-mismatch"));
        expect(mapping.exists()).toBe(false);
    });
});

test("the badge does not disturb the phone app bar", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await seedUsers({ pending: 2 });
    await login(page, ADMIN_EMAIL);

    await expect(accountTrigger(page)).toBeVisible();
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

    for (const viewport of SUPPORTED_PHONE_VIEWPORTS) {
        await page.setViewportSize(viewport);
        await expect(badge(page)).toBeVisible();
        const supportedBar = await bar.boundingBox();
        const supportedTrigger = await accountTrigger(page).boundingBox();
        expect(supportedBar.height).toBe(56);
        expect(supportedTrigger.width).toBe(44);
        expect(supportedTrigger.height).toBe(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            viewport.width
        );
        // The chip stays inside the bar's right inset instead of bleeding off-screen.
        const supportedBadge = await badge(page).boundingBox();
        expect(supportedBadge.x + supportedBadge.width).toBeLessThanOrEqual(viewport.width);
    }
});
