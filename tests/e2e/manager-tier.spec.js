import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc } from "firebase/firestore";

// What each tier actually meets on screen once a manager is named. The rules
// suites prove what the server allows and refuses; this suite is about the app,
// and its most important job is to hold a LINE THAT HAS NOT MOVED YET.
//
// The workspace routing gate in App.jsx is deliberately still the legacy
// `role === "admin"` test. The manager pointer and the Supervisor switch are
// live on the server, but nobody new is routed anywhere, because the employee
// side has no navigation: send a captain to the workspace today and they lose
// their own pay view with no door back, and a captain is paid from the pool.
// The gate moves only together with a captain's route to their own pay. The two
// tests under THE COUPLING below fail the moment someone moves it early - that is
// what they are for. Verified by moving it and watching them go red.
//
// Four accounts, because the release holds two authorities at once:
//
//   manager      named by restaurant/config.managerUid, carrying NO job title.
//                Full manager authority on the server, no workspace yet.
//   legacy admin `role: "admin"`, not named by the pointer. This is production
//                until the pointer is written, and nothing may shrink for them.
//   supervisor   the captain tier: the Supervisor switch on. Settle-up write
//                access on the server, no workspace yet.
//   captain      the same job title with the switch OFF, which is the default
//                every existing captain starts with.
//
// docs/MANAGER-CHANGEOVER.md is the procedure these four states come from, and
// carries the coupling above under "The routing gate".

const PROJECT_ID = "demo-tip-tracker-test";
const PASSWORD = "Password123!";
const CONFIG_PATH = "restaurant/config";

// Today, because the workspace opens on today and the Remove control only
// exists on a day that has a settled shift to remove.
const TODAY = new Date().toLocaleDateString("en-CA");
// A date the seed leaves untouched, so the floor plan there opens empty.
const EMPTY_DAY = "2026-06-05";

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const PEOPLE = {
    manager: { email: "manager-tier@example.com", displayName: "Manager", role: "unassigned" },
    admin: { email: "admin-tier@example.com", displayName: "Admin", role: "admin" },
    supervisor: { email: "supervisor-tier@example.com", displayName: "Captain Supervisor", role: "captain", isSupervisor: true },
    captain: { email: "captain-tier@example.com", displayName: "Captain One", role: "captain" },
};

let testEnv;
let uids = {};

async function createAuthUser({ email, displayName }) {
    const response = await fetch(
        `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password: PASSWORD, displayName, returnSecureToken: true }),
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

// A settled day on today's date, so the manager-only Remove control has
// something to act on the moment the workspace opens.
async function seedRestaurant({ managerNamed = true } = {}) {
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
                username: person.displayName,
                email: person.email,
                role: person.role,
                status: "active",
                ...(person.isSupervisor ? { isSupervisor: true } : {}),
            });
        }

        if (managerNamed) {
            await setDoc(doc(db, CONFIG_PATH), { managerUid: uids.manager });
        } else {
            await deleteDoc(doc(db, CONFIG_PATH));
        }

        await setDoc(doc(db, `shifts/${TODAY}`), {
            date: TODAY,
            status: "closed",
            teams: [{
                teamId: "team-1",
                members: [{ uid: uids.captain, name: "Captain One", role: "captain", points: 4 }],
                pools: { sales: "1000", tips: "200", gratuity: "100", cash: "50" },
            }],
            barTeam: { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } },
            runners: [],
            summary: { balances: { overallBalance: 0 } },
            firstClosedAt: `${TODAY}T02:00:00.000Z`,
        });
        await setDoc(doc(db, "payouts", TODAY), { date: TODAY, ledgerVersion: 1 });
        await setDoc(doc(db, "payouts", TODAY, "entries", uids.captain), {
            date: TODAY,
            uid: uids.captain,
            name: "Captain One",
            role: "captain",
            tips: 184,
            gratuity: 57.6,
            cash: 38.4,
            total: 241.6,
            ledgerVersion: 1,
            source: "closeout",
        });
    });
}

// The Shifts-tab date is an aria-hidden, pointer-events-none native date input
// overlaid on the app bar's day pill, so it is driven by value + change.
async function setShiftDate(page, date) {
    await page.locator('input[type="date"]').first().evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }, date);
}

async function login(page, key) {
    await page.goto("/");
    await page.getByLabel("Username or Email").fill(PEOPLE[key].email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
}

// The workspace marker. NOT the Day Rail - a paid-out day hides the rail - and
// not a day-stage control either, so it reads the same whatever today holds.
// The employee screen has no account sheet at all, so this is the tier line.
const accountTrigger = (page) => page.getByRole("button", { name: /^Account:/ });
const workspace = (page) => accountTrigger(page);
const removeShift = (page) => page.getByRole("button", { name: "Remove this shift" });

// The account sheet is the only door to Team on a phone and is present at every
// width, so its contents are the honest test of whether Team is reachable.
async function teamMenuItemCount(page) {
    await accountTrigger(page).click();
    // Log Out is the sheet's one unconditional item, so it is what proves the
    // sheet is open before a count of zero is allowed to mean anything.
    await expect(page.getByRole("menuitem", { name: "Log Out" })).toBeVisible();
    return page.getByRole("menuitem", { name: /^Team/ }).count();
}

test.beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
});

test.afterAll(async () => {
    await testEnv.cleanup();
});

// THE COUPLING. Naming a manager grants server authority and moves nobody. The
// three tests below are the guard on that, and they are meant to fail loudly if
// the routing gate is moved without a captain's route to their own pay landing
// in the same change - see the comment on the gate in src/App.jsx.

test("naming a manager routes nobody: the pointer holder still lands on their own pay", async ({ page }) => {
    await seedRestaurant();
    await login(page, "manager");

    // Full manager authority on the server - tests/rules/manager-tier.test.js
    // proves every capability - and no workspace, because App.jsx still gates on
    // `role: "admin"`. Inert and harmless in this direction. The other direction
    // is not: it would take this person's own pay away with no door back.
    await expect(page.getByRole("heading", { name: "Tip Tracker" })).toBeVisible();
    await expect(workspace(page)).toHaveCount(0);
});

test("Supervisor on gains settle-up on the server and is still not routed to it", async ({ page }) => {
    await seedRestaurant();
    await login(page, "supervisor");

    // The captain the manager would promote first. They hold real settle-up
    // write access now; the workspace waits on their own-pay entry, because a
    // captain is paid from the pool and would otherwise lose their week.
    await expect(page.getByRole("heading", { name: "Tip Tracker" })).toBeVisible();
    await expect(workspace(page)).toHaveCount(0);
    await expect(removeShift(page)).toHaveCount(0);
});

test("the manager is not on the floor - they never appear in the pool to assign", async ({ page }) => {
    await seedRestaurant();
    // Driven as the admin, who is who reaches the workspace today. The pointer
    // names someone else, so this tests the manager exclusion and not the
    // legacy `role !== "admin"` filter sitting beside it.
    await login(page, "admin");
    await expect(workspace(page)).toBeVisible();

    // A day with no shift yet, so the floor plan opens empty.
    await setShiftDate(page, EMPTY_DAY);
    await page.getByRole("button", { name: /Build floor plan/i }).click();
    await expect(page.getByRole("heading", { name: "AVAILABLE EMPLOYEES" })).toBeVisible();

    // The assignable rows themselves, not the panel around them - the app bar
    // also says "Manager" (the tier badge), and that must not answer for the pool.
    const poolRows = page.locator('[title="Drag to assign"]');
    // Both captains are assignable - a switch off changes nobody's pay - and the
    // manager is not, because they oversee the operation and work no section.
    // Assigning them would also pay them zero: ROLE_POINTS knows no manager.
    await expect(poolRows.filter({ hasText: "Captain Supervisor" })).toHaveCount(1);
    await expect(poolRows.filter({ hasText: "Captain One" })).toHaveCount(1);
    await expect(poolRows.filter({ hasText: "Manager" })).toHaveCount(0);
});

test("today's admin loses nothing when someone else is named manager", async ({ page }) => {
    await seedRestaurant();
    await login(page, "admin");

    // The pointer names the manager, not this account, and the legacy clause
    // still carries it. Production is in exactly this state until the pointer
    // is written, and will be in it again the moment it is.
    await expect(workspace(page)).toBeVisible();
    await expect(removeShift(page)).toBeVisible();
    expect(await teamMenuItemCount(page)).toBe(1);
});

test("today's admin is unchanged with no manager named at all", async ({ page }) => {
    await seedRestaurant({ managerNamed: false });
    await login(page, "admin");

    // The state the live database is in right now: no restaurant/config
    // document anywhere. Nothing here may differ from the test above.
    await expect(workspace(page)).toBeVisible();
    await expect(removeShift(page)).toBeVisible();
    expect(await teamMenuItemCount(page)).toBe(1);
});

test("Supervisor off is an ordinary employee, whatever the job title says", async ({ page }) => {
    await seedRestaurant();
    await login(page, "captain");

    // Where every existing captain starts, and today the switch changes nothing
    // about this screen - which is the point. Note what this screen does NOT
    // have: no app bar, no account sheet, no nav of any kind. That is why the
    // routing gate cannot move on its own; there would be no way back to here.
    await expect(page.getByRole("heading", { name: "Tip Tracker" })).toBeVisible();
    await expect(removeShift(page)).toHaveCount(0);
    await expect(accountTrigger(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Team$/ })).toHaveCount(0);
});
