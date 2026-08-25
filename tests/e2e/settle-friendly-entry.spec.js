import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

// Friendly entry into Settle up, Path 3 (2026-08-24 lock, on top of Direction A),
// as narrowed by the Settle-landing review (2026-08-25): the who's-left checklist
// marks whichever group the signed-in captain is on tonight's floor plan with a
// "· yours" hint, and every row - not a pinned card or footer button - carries
// the tap into Settle up. Save and Mark Done is a floating action, and saving
// returns to the who's-left landing - see
// data/tip-tracker-settle-landing-review/report.md ("The decided landing").
//
// Three cases, matching the report's own spec:
//   1. A captain seeded on Team 2: the row reads "Team 2 · yours", tapping it
//      opens Team 2's tab, Save and Mark Done floats, and saving returns to the
//      landing with Team 2 settled and the rest of the day still counted.
//   2. The manager (never on a floor plan) sees the plain checklist, no "· yours"
//      hint on any row.
//   3. Every gated group already done: the landing offers "All groups closed -
//      Review →", and it opens Review.

const PROJECT_ID = "demo-tip-tracker-test";
const PASSWORD = "Password123!";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const IPHONE_17_PRO = { width: 402, height: 874 };

const TWO_TEAM_DAY = "2026-06-10";
const ALL_CLOSED_DAY = "2026-06-11";

const PEOPLE = {
    manager: { email: "manager-friendlyentry@example.com", firstName: "Mika", lastName: "Alvarez", role: "unassigned" },
    captain: { email: "captain-friendlyentry@example.com", firstName: "Nadia", lastName: "Okonkwo", role: "captain", isSupervisor: true },
    server: { email: "server-friendlyentry@example.com", firstName: "Sam", lastName: "Ortiz", role: "server" },
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
    if (!response.ok) throw new Error(`Failed to create auth user: ${await response.text()}`);
    return response.json();
}

async function clearAuthUsers() {
    await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
}

// A saved-but-not-settled ("setup") day with two dining teams: Team 1 (a
// server, nothing entered) and Team 2 (the captain, whose row should carry
// the "· yours" hint). Both are open, so the checklist's "still open" count
// has something to count once Team 2 is marked done.
async function seedTwoTeamDay(db) {
    await setDoc(doc(db, `shifts/${TWO_TEAM_DAY}`), {
        date: TWO_TEAM_DAY,
        status: "setup",
        teams: [
            {
                teamId: "team-1",
                members: [{ uid: uids.server, name: "Sam Ortiz", role: "server", points: 4 }],
                pools: { sales: "", tips: "", gratuity: "", cash: "" },
            },
            {
                teamId: "team-2",
                members: [{ uid: uids.captain, name: "Nadia Okonkwo", role: "captain", points: 4 }],
                pools: { sales: "", tips: "", gratuity: "", cash: "" },
            },
        ],
        barTeam: { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } },
        runners: [],
    });
}

// A setup day whose one dining team is already funded and marked done -
// everything the who's-left checklist gates on is already closed.
async function seedAllClosedDay(db) {
    await setDoc(doc(db, `shifts/${ALL_CLOSED_DAY}`), {
        date: ALL_CLOSED_DAY,
        status: "setup",
        teams: [
            {
                teamId: "team-1",
                members: [{ uid: uids.captain, name: "Nadia Okonkwo", role: "captain", points: 4 }],
                pools: { sales: "1000", tips: "200", gratuity: "100", cash: "50" },
                markedDone: true,
            },
        ],
        barTeam: { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } },
        runners: [],
    });
    await setDoc(doc(db, `shifts/${ALL_CLOSED_DAY}/settleGroups/team-1`), {
        pools: { sales: "1000", tips: "200", gratuity: "100", cash: "50" },
        contracts: [],
        markedDone: true,
        updatedAt: `${ALL_CLOSED_DAY}T02:00:00.000Z`,
        updatedBy: null,
    });
}

async function seedRestaurant() {
    await testEnv.clearFirestore();
    await clearAuthUsers();

    uids = {};
    for (const [key, person] of Object.entries(PEOPLE)) {
        uids[key] = (await createAuthUser({ email: person.email, displayName: `${person.firstName} ${person.lastName}` })).localId;
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        for (const [key, person] of Object.entries(PEOPLE)) {
            await setDoc(doc(db, `users/${uids[key]}`), {
                uid: uids[key],
                username: person.email.split("@")[0],
                firstName: person.firstName,
                lastName: person.lastName,
                email: person.email,
                role: person.role,
                status: "active",
                ...(person.isSupervisor ? { isSupervisor: true } : {}),
            });
        }

        // The manager tier is live, so the "no pinned card" case is a real
        // signed-in manager, not merely an unassigned viewer.
        await setDoc(doc(db, "restaurant/config"), { managerUid: uids.manager });

        await seedTwoTeamDay(db);
        await seedAllClosedDay(db);
    });
}

async function setShiftDate(page, date) {
    await page.locator('input[type="date"]').first().evaluate((el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }, date);
}

// A captain lands on their own pay - the workspace is one tap away through the
// account sheet - while the manager (no pay record) lands straight on it.
async function login(page, email) {
    await page.goto("/");
    await page.getByLabel("Username or Email").fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("button", { name: /^Account:/ })).toBeVisible();

    const shiftsLanding = page.getByRole("heading", { name: "Let's set up the floor" })
        .or(page.getByRole("navigation", { name: "Day steps" }));
    if (!(await shiftsLanding.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: /^Account:/ }).click();
        await page.getByRole("menuitem", { name: /^Shifts/ }).click();
    }
    await expect(shiftsLanding).toBeVisible();
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

test.beforeEach(async () => {
    await seedRestaurant();
});

test.describe("friendly entry into Settle up", () => {
    test.use({ viewport: IPHONE_17_PRO });

    test("a captain on Team 2 gets a '· yours' row hint, and Save and Mark Done floats", async ({ page }) => {
        await login(page, PEOPLE.captain.email);
        await setShiftDate(page, TWO_TEAM_DAY);

        // The checklist marks the captain's own group - not Team 1, which is
        // also open tonight but not theirs.
        const yoursRow = page.getByRole("button", { name: /Team 2/ });
        await expect(yoursRow.getByText("· yours")).toBeVisible();

        // Tapping the row opens Team 2's tab - the row carries every tap now,
        // there is no separate pinned card or "Settle up →" button.
        await yoursRow.click();
        await expect(page.getByRole("tab", { name: /Team 2/ })).toHaveAttribute("aria-selected", "true");

        // Enter Team 2's money.
        await page.getByRole("spinbutton", { name: "Sales", exact: true }).fill("800");
        await page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true }).fill("150");
        await page.getByRole("spinbutton", { name: "Gratuity", exact: true }).fill("75");

        // Save and Mark Done is a floating action, not a button inside the panel.
        const floatingDone = page.getByRole("button", { name: "Save and Mark Done" });
        await expect(floatingDone).toBeVisible();
        await floatingDone.click();

        // Decision 3: back on the who's-left landing, not left on the panel just saved.
        await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible();
        await expect(page.getByRole("tab", { name: /Team 2/ })).toHaveCount(0);

        // Settle-landing review decision 1: the pinned card and its quiet
        // "✓ Settled" state are gone - your own group just reads "Done" in the list.
        await expect(page.getByRole("button", { name: /Team 2/ }).getByText("Done")).toBeVisible();

        // The rest of the day is still counted - Team 1 has nothing entered yet.
        await expect(page.getByText("1 group still open")).toBeVisible();
    });

    test("the manager, never on a floor plan, sees the plain checklist with no '· yours' hint", async ({ page }) => {
        await login(page, PEOPLE.manager.email);
        await setShiftDate(page, TWO_TEAM_DAY);

        await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible();
        await expect(page.getByText("· yours")).toHaveCount(0);

        // Every group is still one tap away, same as Direction A's plain landing.
        await expect(page.getByRole("button", { name: /Team 1/ })).toBeVisible();
        await expect(page.getByRole("button", { name: /Team 2/ })).toBeVisible();
    });

    test("once every gated group is done, the landing hands off straight to Review", async ({ page }) => {
        await login(page, PEOPLE.captain.email);
        await setShiftDate(page, ALL_CLOSED_DAY);

        await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible();
        await expect(page.getByText("All done")).toBeVisible();

        const reviewButton = page.getByRole("button", { name: "All groups closed - Review →" });
        await expect(reviewButton).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue Settle up →" })).toHaveCount(0);
        await reviewButton.click();

        await expect(page.getByRole("button", { name: "Confirm & Save Shift" })).toBeVisible();
    });

    // Regression (captain-reported, 2026-08-24): opening a team from the
    // checklist used to be a trap on a phone - there is no sidebar there, and
    // the account sheet's "Shifts" item jumps to TODAY rather than back to the
    // day being edited. A Supervisor covering two teams could get into the
    // first one and never find their way back to pick the second.
    test("opening a team from the checklist is not a trap: the rail's Back control returns to the same day", async ({ page }) => {
        await login(page, PEOPLE.captain.email);
        await setShiftDate(page, TWO_TEAM_DAY);

        await page.getByRole("button", { name: /Team 1/ }).click();
        await expect(page.getByRole("tab", { name: /Team 1/ })).toHaveAttribute("aria-selected", "true");

        const backLink = page.getByRole("button", { name: "Back", exact: true });
        await expect(backLink).toBeVisible();
        await backLink.click();

        // Back on THIS day's checklist, not today's.
        await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible();
        await expect(page.getByRole("button", { name: /Shift date:/ })).toContainText("Jun 10");

        // A different team is one tap away from there.
        await page.getByRole("button", { name: /Team 2/ }).click();
        await expect(page.getByRole("tab", { name: /Team 2/ })).toHaveAttribute("aria-selected", "true");
    });
});
