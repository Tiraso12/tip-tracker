import { mkdirSync, readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

// What each tier actually meets on screen once a manager is named. The rules
// suites prove what the server allows and refuses; this suite is about the app.
//
// Its most important job is THE COUPLING: the workspace routing gate and a
// captain's route to their own pay are one change and must stay one. A captain
// is a supervisor AND a paid member of the tip pool, so they hold both screens
// and neither may be a dead end. Route them to the workspace with no way back
// and they silently lose their week; leave the gate on the legacy role test and
// nobody the manager promotes can run a night. The tests under THE COUPLING
// below fail if either half is undone.
//
// Four accounts, because the release holds two authorities at once:
//
//   manager      named by restaurant/config.managerUid, carrying NO job title.
//                Full manager authority, and no pay record - they work no
//                section and take no share of the pool.
//   legacy admin `role: "admin"`, not named by the pointer. This is production
//                until the pointer is written, and nothing may shrink for them.
//   supervisor   the captain tier: the Supervisor switch on. Lands on their own
//                pay and reaches the workspace from it.
//   captain      the same job title with the switch OFF, which is the default
//                every existing captain starts with: an ordinary employee.
//
// docs/MANAGER-CHANGEOVER.md is the procedure these four states come from.

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
    server: { email: "server-tier@example.com", displayName: "Server One", role: "server" },
    pending: { email: "pending-tier@example.com", displayName: "Pending User", role: "unassigned", status: "pending" },
    inactive: { email: "inactive-tier@example.com", displayName: "Inactive User", role: "server", status: "inactive" },
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
                firstName: person.displayName,
                lastName: "",
                email: person.email,
                role: person.role,
                status: person.status || "active",
                ...(person.isSupervisor ? { isSupervisor: true } : {}),
            });
        }

        await setDoc(doc(db, "unregisteredStaff/temp-tier"), {
            uid: "temp-tier",
            name: "Temp Staff",
            username: "Temp Staff",
            role: "server",
            status: "active",
            isUnregistered: true,
        });

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
        await setDoc(doc(db, "payouts", TODAY, "entries", uids.server), {
            date: TODAY,
            uid: uids.server,
            name: "Server One",
            role: "server",
            points: 4,
            tips: 123.45,
            gratuity: 34.5,
            cash: 20,
            total: 157.95,
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

// The two surfaces, each read by something structural rather than by a control
// that a day's stage could hide. Both halves now carry the same app bar, so the
// account sheet is no longer the line between them.
const accountTrigger = (page) => page.getByRole("button", { name: /^Account:/ });
const workspace = (page) => page.locator("#admin-workspace-nav");
const payStatement = (page) => page.getByTestId("pay-statement");
const removeShift = (page) => page.getByRole("button", { name: "Remove this shift" });

// The account sheet is the only door to Team or Shifts on a phone and is
// present at every width, so its contents are the honest test of what is
// reachable.
async function accountMenuItems(page) {
    await accountTrigger(page).click();
    // Log Out is the sheet's one unconditional item, so it is what proves the
    // sheet is open before an empty list is allowed to mean anything.
    await expect(page.getByRole("menuitem", { name: "Log Out" })).toBeVisible();
    const texts = await page.getByRole("menuitem").allInnerTexts();
    // Just the labels: an item may carry a pending-approval count, and how many
    // people are waiting is a different test's business.
    return texts.map((text) => text.replace(/\d+$/, "").trim());
}

async function openTeamFromWorkspace(page) {
    await accountTrigger(page).click();
    await page.getByRole("menuitem", { name: /^Team/ }).click();
    await expect(page.getByTestId("team-roster")).toBeVisible();
}

async function openWorkspaceAndTeam(page) {
    await accountTrigger(page).click();
    await page.getByRole("menuitem", { name: /^Shifts/ }).click();
    await expect(workspace(page)).toBeAttached();
    await openTeamFromWorkspace(page);
}

test.beforeAll(async () => {
    mkdirSync("artifacts/team-roster", { recursive: true });
    mkdirSync("artifacts/profile-name-split", { recursive: true });
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
});

test.afterAll(async () => {
    await testEnv.cleanup();
});

// THE COUPLING. A captain holds two things at once and neither may strand them.
// The three tests below are the guard on that: the first pins that a captain
// lands on their own pay AND can reach the workspace and get back, the second
// that Supervisor off changes nothing for an ordinary employee, and the third
// that the manager - who has no pay record - is not sent looking for one.

test("a Supervisor-on captain holds both their own pay and the workspace, and neither is a dead end", async ({ page }) => {
    await seedRestaurant();
    await login(page, "supervisor");

    // They LAND on their own pay. That is the shape the captain chose: the pool
    // pays them, so their week is home, and tonight's shift is a tap away.
    await expect(payStatement(page)).toBeVisible();
    await expect(workspace(page)).toHaveCount(0);

    // The way across, in the one place a phone keeps destinations.
    await accountTrigger(page).click();
    await page.getByRole("menuitem", { name: /^Shifts/ }).click();
    await expect(workspace(page)).toBeAttached();
    await expect(payStatement(page)).toHaveCount(0);

    // Removing a settled day is manager-only, and stays that way in here.
    await expect(removeShift(page)).toHaveCount(0);

    // And the way back: home means THIS person's home, which is their pay.
    await page.getByRole("button", { name: "Go to my pay" }).click();
    await expect(payStatement(page)).toBeVisible();
});

// The pay side reads a WEEK, so its prev/next step one Friday-start work week -
// the same unit the label is written in, and the same weeks the statement is cut
// into. Seven arbitrary days would drift the anchor off Friday and quietly show a
// range the pay period never had.
test("prev/next on the pay side step one Friday-start work week", async ({ page }) => {
    await seedRestaurant();
    await login(page, "supervisor");
    await expect(payStatement(page)).toBeVisible();

    const weekPill = page.getByRole("button", { name: /^Pay week:/ });
    const pillWidth = async () => Math.round((await weekPill.boundingBox()).width);

    // A step must not RESIZE the control: the thumb is still on the arrow when the
    // label swaps. They land on the CURRENT week, so this compares the one state
    // that used to be wider ("This week · ...") against an ordinary one.
    await expect(weekPill).toHaveText(/^Week of /);
    const currentWeekWidth = await pillWidth();
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(weekPill).not.toHaveAttribute("aria-label", /this week/);
    expect(await pillWidth()).toBe(currentWeekWidth);

    // ...and the current week is still nameable, just not in a way that costs width.
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(weekPill).toHaveAttribute("aria-label", /this week/);

    // Anchor on a Sunday inside the week that starts Fri May 22, through the same
    // hidden native input the pill's calendar drives. Stepping must re-anchor to
    // that Friday rather than move to the following Sunday.
    await page.locator('header input[type="date"]').first().evaluate((el) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, "2026-05-24");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(weekPill).toHaveText(/Week of May 22/);

    await page.getByRole("button", { name: "Next week" }).click();
    await expect(weekPill).toHaveText(/Week of May 29/);
    await expect(payStatement(page)).toContainText("May 29 - Jun 4");

    await page.getByRole("button", { name: "Previous week" }).click();
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(weekPill).toHaveText(/Week of May 15/);

    // The calendar is still the other way in - this was an addition, not a swap.
    await expect(page.locator('header input[type="date"]')).toHaveCount(1);
});

test("the manager gets the workspace and no pay page - they have no pay record", async ({ page }) => {
    await seedRestaurant();
    await login(page, "manager");

    // Full manager authority - tests/rules/manager-tier.test.js proves every
    // capability - and no statement to show, because the manager oversees the
    // operation, works no section and takes no share of the pool.
    await expect(workspace(page)).toBeAttached();
    await expect(payStatement(page)).toHaveCount(0);

    // Home means today's shifts for them, and the sheet carries their account and Team:
    // a destination is listed there exactly when home does not already lead to it.
    await expect(page.getByRole("button", { name: "Go to today's shifts" })).toBeVisible();
    expect(await accountMenuItems(page)).toEqual(["Your account", "Team", "Log Out"]);
});

test("the manager gets one searchable roster and deliberate person actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedRestaurant();
    await login(page, "manager");
    await openTeamFromWorkspace(page);

    const rows = page.locator('[data-testid^="roster-row-"]');
    await expect(rows).toHaveCount(6);
    const geometry = await rows.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { height: box.height, top: box.top, bottom: box.bottom };
    }));
    expect(geometry.every(({ height }) => height === 64)).toBe(true);
    const fullyVisibleRows = geometry.filter(({ top, bottom }) => top >= 0 && bottom <= 844).length;
    console.log(`TEAM_DENSITY phone row=64px fully-visible=${fullyVisibleRows} viewport=390x844`);

    await page.screenshot({ path: "artifacts/team-roster/manager-roster-phone.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "artifacts/team-roster/manager-roster-desktop.png", fullPage: true });

    await page.getByLabel("Search team").fill("nothing matches this");
    await expect(page.getByText("No people found")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();

    await page.getByRole("button", { name: /^Pending 1$/ }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole("button", { name: /Open Pending User/ }).click();
    await expect(page.getByTestId("management-actions")).toBeVisible();
    await page.getByLabel("Job title").selectOption("server");

    page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("Assign Pending User the job title Server?");
        expect(dialog.message()).toContain("default point weight");
        await dialog.accept();
    });
    await page.getByRole("button", { name: "Save job title" }).click();
    await expect(page.getByTestId("person-identity")).toContainText("Server");
    await expect(page.getByRole("button", { name: "Approve account" })).toBeEnabled();

    await page.getByRole("button", { name: "Back to team roster" }).click();
    await page.getByRole("button", { name: /^Temp 1$/ }).click();
    await page.getByRole("button", { name: /Open Temp Staff/ }).click();
    await expect(page.getByText(/per date and all-or-nothing/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Merge profile" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete temporary profile" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "artifacts/team-roster/manager-temp-person-phone.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "artifacts/team-roster/manager-temp-person-desktop.png", fullPage: true });
});

test("work names have one source while the login handle and Auth display name stay separate", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedRestaurant();
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), `users/${uids.server}`), {
            username: "server-login",
            firstName: "Sonia",
            lastName: "Alvarez Garcia",
        });
    });

    await login(page, "manager");
    await openTeamFromWorkspace(page);
    await expect(page.getByRole("button", { name: /Open Sonia, Server, Active/ })).toBeVisible();
    await expect(page.getByText("server-login")).toHaveCount(0);

    await page.getByRole("button", { name: /Open Sonia, Server, Active/ }).click();
    await expect(page.getByTestId("person-identity")).toContainText("Sonia Alvarez Garcia");
    await page.getByRole("button", { name: "Back to team roster" }).click();

    await page.getByRole("button", { name: "Shifts", exact: true }).click();
    await setShiftDate(page, EMPTY_DAY);
    await page.getByRole("button", { name: /Build floor plan/i }).click();
    const poolRows = page.locator('[title="Drag to assign"]');
    await expect(poolRows.filter({ hasText: "Sonia" })).toHaveCount(1);
    await expect(poolRows.filter({ hasText: "Alvarez Garcia" })).toHaveCount(0);
    await expect(poolRows.filter({ hasText: "server-login" })).toHaveCount(0);

    const teamZone = page.getByRole("heading", { name: "Team 1", exact: true }).locator("..").locator("..");
    await teamZone.getByRole("button", { name: /Team 1/i }).click();
    await page.getByRole("button", { name: "Sonia SERVER" }).click();
    await expect(page.getByText("Sonia", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: "artifacts/profile-name-split/manager-floor-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "artifacts/profile-name-split/manager-floor-phone.png", fullPage: true });
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await accountTrigger(page).click();
    await page.getByRole("menuitem", { name: "Log Out" }).click();
    await login(page, "server");
    await expect(accountTrigger(page)).toHaveAccessibleName(/Account: Sonia Alvarez Garcia/);
    await accountTrigger(page).click();
    await expect(page.getByText("Sonia Alvarez Garcia", { exact: true })).toBeVisible();
    await expect(page.getByText("Server One", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "artifacts/profile-name-split/employee-account-phone.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "artifacts/profile-name-split/employee-account-desktop.png", fullPage: true });
});

test("a Supervisor-on captain reads a colleague's shared pay statement and no management actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedRestaurant();
    await login(page, "supervisor");
    await openWorkspaceAndTeam(page);

    await page.getByRole("button", { name: /Open Server One/ }).click();
    await expect(page.getByTestId("person-identity")).toContainText("Server One");
    await expect(page.getByTestId("management-actions")).toHaveCount(0);
    await expect(payStatement(page)).toBeVisible();
    await expect(payStatement(page)).toContainText("CTP");
    await expect(payStatement(page)).toContainText("GRT");
    await expect(payStatement(page)).toContainText("Cash");
    await expect(payStatement(page)).toContainText("$157.95");

    await page.screenshot({ path: "artifacts/team-roster/supervisor-person-phone.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "artifacts/team-roster/supervisor-person-desktop.png", fullPage: true });
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
    await expect(payStatement(page)).toHaveCount(0);
    expect(await accountMenuItems(page)).toEqual(["Your account", "Team", "Log Out"]);
});

test("today's admin is unchanged with no manager named at all", async ({ page }) => {
    await seedRestaurant({ managerNamed: false });
    await login(page, "admin");

    // The state the live database is in right now: no restaurant/config
    // document anywhere. Nothing here may differ from the test above.
    await expect(workspace(page)).toBeVisible();
    await expect(removeShift(page)).toBeVisible();
    await expect(payStatement(page)).toHaveCount(0);
    expect(await accountMenuItems(page)).toEqual(["Your account", "Team", "Log Out"]);
});

// The Supervisor control is offered to an active captain-titled person and to
// nobody else, and it is safe to be that narrow only because the state it does
// not render cannot be created: moving somebody off the captain title clears
// their switch in the SAME write as the role change. A second, separate write
// could fail on its own and leave a non-captain holding the tier, so the two
// fields must land together. That is what the read-back below pins.
test("the Supervisor switch is offered to captains only, and a title change clears it in the same write", async ({ page }) => {
    await seedRestaurant();
    await login(page, "manager");
    await openTeamFromWorkspace(page);

    // A server is never offered it, whatever else the manager may do to them.
    await page.getByRole("button", { name: /Open Server One/ }).click();
    await expect(page.getByTestId("management-actions")).toBeVisible();
    await expect(page.getByTestId("supervisor-switch")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to team roster" }).click();

    // A captain holding the switch is, and the only action is turning it off.
    await page.getByRole("button", { name: /Open Captain Supervisor/ }).click();
    await expect(page.getByTestId("supervisor-switch")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();

    // Move them off the captain title. The confirmation says the switch goes
    // with it, because rights must not outlive the title that qualifies them.
    await page.getByLabel("Job title").selectOption("server");
    page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("Change Captain Supervisor's job title from Captain to Server?");
        expect(dialog.message()).toContain("Their Supervisor switch will also be turned off");
        await dialog.accept();
    });
    await page.getByRole("button", { name: "Save job title" }).click();

    // Both fields, from one confirmed action - and the control is gone with the
    // title, leaving nothing stranded to turn off.
    await expect(page.getByTestId("person-identity")).toContainText("Server");
    await expect(page.getByTestId("supervisor-switch")).toHaveCount(0);
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const profile = await getDoc(doc(context.firestore(), `users/${uids.supervisor}`));
        expect(profile.data().role).toBe("server");
        expect(profile.data().isSupervisor).toBe(false);
    });
});

test("Supervisor off is an ordinary employee, whatever the job title says", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedRestaurant();
    await login(page, "captain");

    // Where every existing captain starts. They are paid exactly as a captain -
    // the switch moves no money - and see exactly what a server sees: their own
    // pay and no door to anything else.
    await expect(payStatement(page)).toBeVisible();
    await expect(workspace(page)).toHaveCount(0);
    await expect(removeShift(page)).toHaveCount(0);
    expect(await accountMenuItems(page)).toEqual(["Your account", "Log Out"]);
    await page.screenshot({ path: "artifacts/team-roster/supervisor-off-phone.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "artifacts/team-roster/supervisor-off-desktop.png", fullPage: true });
});
