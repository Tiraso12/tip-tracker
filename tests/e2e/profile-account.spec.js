import { mkdirSync, readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Account self-service: the identity surface every tier meets, and what changing
// your own name, password or login handle does to the rest of the app.
//
// Both halves of the app share one identity card, so this drives all four kinds
// of account at phone and desktop width to prove none of them meets a lesser
// version of it. The name change is the load-bearing case: it has to follow the
// person onto open floor plans while leaving settled history frozen under the
// name that was paid.

const PROJECT_ID = "demo-tip-tracker-test";
const PASSWORD = "Password123!";
const NEW_PASSWORD = "NewPassword456!";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const SHOTS_DIR = "artifacts/profile-account";
const OPEN_DATE = "2026-06-01";
const CLOSED_DATE = "2026-05-31";

const PEOPLE = {
    manager: { email: "manager-profile@example.com", username: "Manager Profile", firstName: "Morgan", lastName: "Manager", role: "unassigned" },
    supervisor: { email: "supervisor-profile@example.com", username: "Supervisor Profile", firstName: "Sam", lastName: "Supervisor", role: "captain", isSupervisor: true },
    captain: { email: "captain-profile@example.com", username: "Captain Profile", firstName: "Casey", lastName: "Captain", role: "captain" },
    employee: { email: "employee-profile@example.com", username: "Employee Profile", firstName: "Elliot", lastName: "Employee", role: "server" },
    pending: { email: "pending-profile@example.com", username: "Pending Profile", firstName: "Parker", lastName: "Pending", role: "unassigned", status: "pending" },
};

let testEnv;
let uids = {};

async function createAuthUser(person) {
    const response = await fetch(`http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: person.email, password: PASSWORD, displayName: `${person.firstName} ${person.lastName}`, returnSecureToken: true }),
    });
    if (!response.ok) throw new Error(`Failed to create auth user: ${await response.text()}`);
    return response.json();
}

async function clearAuthUsers() {
    await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
}

async function seed() {
    await testEnv.clearFirestore();
    await clearAuthUsers();
    uids = {};
    for (const [key, person] of Object.entries(PEOPLE)) {
        uids[key] = (await createAuthUser(person)).localId;
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        for (const [key, person] of Object.entries(PEOPLE)) {
            await setDoc(doc(db, `users/${uids[key]}`), {
                uid: uids[key],
                username: person.username,
                firstName: person.firstName,
                lastName: person.lastName,
                email: person.email,
                role: person.role,
                status: person.status || "active",
                createdAt: "2026-01-15T12:00:00.000Z",
                ...(person.isSupervisor ? { isSupervisor: true } : {}),
            });
            await setDoc(doc(db, `usernames/${person.username.toLocaleLowerCase()}`), {
                uid: uids[key],
                username: person.username,
                email: person.email,
                createdAt: "2026-01-15T12:00:00.000Z",
            });
        }
        await setDoc(doc(db, "restaurant/config"), { managerUid: uids.manager });
        await setDoc(doc(db, `shifts/${OPEN_DATE}`), {
            date: OPEN_DATE,
            status: "setup",
            teams: [{
                teamId: "team-1",
                members: [{ uid: uids.employee, name: "Elliot", role: "server", points: 4 }],
                pools: { sales: "1000", tips: "200", gratuity: "100", cash: "50" },
            }],
            barTeam: { members: [], pools: {} },
            runners: [],
            updatedAt: "2026-06-01T12:00:00.000Z",
        });
        await setDoc(doc(db, `shifts/${CLOSED_DATE}`), {
            date: CLOSED_DATE,
            status: "closed",
            teams: [{
                teamId: "team-1",
                members: [{ uid: uids.employee, name: "Elliot", role: "server", points: 4 }],
                pools: { sales: "1000", tips: "200", gratuity: "100", cash: "50" },
            }],
            barTeam: { members: [], pools: {} },
            runners: [],
            closedAt: "2026-05-31T23:00:00.000Z",
            updatedAt: "2026-05-31T23:00:00.000Z",
        });
    });
}

async function login(page, key, password = PASSWORD, identifier = PEOPLE[key].email) {
    await page.goto("/");
    await page.getByLabel("Username or Email").fill(identifier);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Log In" }).click();
}

async function openAccount(page) {
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: "Your account" }).click();
    await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
}

async function logout(page) {
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: "Log Out" }).click();
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
}

test.beforeAll(async () => {
    mkdirSync(SHOTS_DIR, { recursive: true });
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
});

test.beforeEach(seed);
test.afterAll(async () => testEnv.cleanup());

test("all four account kinds reach the same complete identity surface on phone and desktop", async ({ page }) => {
    // The Supervisor fact is only ever true for a captain-titled person - see
    // canOfferSupervisor in permissions.js - so the identity card shows the row
    // for captain and supervisor only, and omits it entirely for a manager or
    // an ordinary employee rather than stating a dead "Off".
    const expected = {
        manager: { title: "Not assigned", tier: "Manager", supervisor: null },
        supervisor: { title: "Captain", tier: "Captain", supervisor: "On" },
        captain: { title: "Captain", tier: "Employee", supervisor: "Off" },
        employee: { title: "Server", tier: "Employee", supervisor: null },
    };

    for (const viewport of [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        for (const key of Object.keys(expected)) {
            await login(page, key);
            await openAccount(page);
            const card = page.getByTestId("person-identity");
            await expect(card).toContainText(`${PEOPLE[key].firstName} ${PEOPLE[key].lastName}`);
            await expect(card).toContainText(PEOPLE[key].username);
            await expect(card).toContainText(PEOPLE[key].email);
            await expect(card).toContainText(expected[key].title);
            await expect(card).toContainText(expected[key].tier);
            if (expected[key].supervisor) {
                await expect(card).toContainText(expected[key].supervisor);
                await expect(card).toContainText("Supervisor");
            } else {
                await expect(card).not.toContainText("Supervisor");
            }
            await expect(card).toContainText("Active");
            await expect(card).toContainText("January 15, 2026");
            await page.screenshot({ path: `${SHOTS_DIR}/${key}-${viewport.name}.png`, fullPage: true });
            await logout(page);
        }
    }
});

test("pending approval shows the name and login email that were submitted", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "pending");
    await expect(page.getByRole("heading", { name: "Account Pending" })).toBeVisible();
    await expect(page.getByText("Parker Pending")).toBeVisible();
    await expect(page.getByText(PEOPLE.pending.email)).toBeVisible();
    await page.screenshot({ path: `${SHOTS_DIR}/pending-phone.png`, fullPage: true });
});

test("name, password, and handle changes stay recoverable and preserve settled history", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "employee");
    await openAccount(page);

    await page.getByRole("button", { name: "Edit name" }).click();
    await page.getByLabel("First name").fill("Sonia");
    await page.getByLabel("Last name (optional)").fill("Alvarez Garcia");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("status")).toContainText("updated on 1 open floor plan");
    await expect(page.getByTestId("person-identity")).toContainText("Sonia Alvarez Garcia");

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const profile = (await getDoc(doc(db, `users/${uids.employee}`))).data();
        const open = (await getDoc(doc(db, `shifts/${OPEN_DATE}`))).data();
        const closed = (await getDoc(doc(db, `shifts/${CLOSED_DATE}`))).data();
        expect(profile.firstName).toBe("Sonia");
        expect(profile.lastName).toBe("Alvarez Garcia");
        expect(open.memberNames[uids.employee]).toBe("Sonia");
        expect(closed.teams[0].members[0].name).toBe("Elliot");
        expect(closed.memberNames).toBeUndefined();
    });

    await page.getByRole("button", { name: "Change handle" }).click();
    await expect(page.getByRole("dialog")).toContainText("Anyone can claim it after this change");
    await page.getByLabel("New login handle").fill("Sonia Login");
    await page.getByRole("button", { name: "Release old and change" }).click();
    await expect(page.getByTestId("person-identity")).toContainText("Sonia Login");

    await page.getByRole("button", { name: "Change password" }).click();
    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).last().click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText("password has been changed");
    await page.getByRole("button", { name: "Done" }).click();
    await page.screenshot({ path: `${SHOTS_DIR}/employee-updated-phone.png`, fullPage: true });

    await logout(page);
    await login(page, "employee", NEW_PASSWORD, PEOPLE.employee.username);
    await expect(page.getByText(/user not found/i)).toBeVisible();

    await page.getByLabel("Username or Email").fill(PEOPLE.employee.email);
    await page.getByRole("textbox", { name: "Password" }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("button", { name: /^Account: Sonia Alvarez Garcia/ })).toBeVisible();
    await logout(page);

    await login(page, "employee", NEW_PASSWORD, "Sonia Login");
    await expect(page.getByRole("button", { name: /^Account: Sonia Alvarez Garcia/ })).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        expect((await getDoc(doc(db, "usernames/employee profile"))).exists()).toBe(false);
        expect((await getDoc(doc(db, "usernames/sonia login"))).data().uid).toBe(uids.employee);
        expect((await getDoc(doc(db, `users/${uids.employee}`))).data().username).toBe("Sonia Login");
    });
});
