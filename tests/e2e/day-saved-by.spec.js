import { mkdirSync, readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

// The one quiet line at the top of a settled day: who last saved it, and when.
// Both halves come off `shifts/{date}` - `updatedBy` (a uid, resolved to a name)
// and `updatedAt` - and the whole surface is read-only.
//
// What these tests are actually guarding, beyond "the line renders":
//
//   * it says SAVED, not settled, and names a person rather than a uid;
//   * the same line, word for word, for the manager and for a captain - the
//     workspace gate is the audience, so there is no second one;
//   * older nights are ordinary, not alarming: a night with no saver recorded
//     shows the time alone, a night with no timestamp shows nothing, and
//     neither is dressed up as a warning;
//   * browsing days never pairs one night's timestamp with another night's
//     saver, not even for a frame - a line whose whole job is attribution has
//     no honest way to misattribute;
//   * at the supported phone floor it stays a footnote and the clock time never
//     breaks in half.

const PROJECT_ID = "demo-tip-tracker-test";
const PASSWORD = "Password123!";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const SHOTS_DIR = process.env.SAVED_BY_SHOTS_DIR || "artifacts/day-saved-by";

const PHONE = { width: 390, height: 844 };
const NARROW_PHONE = { width: 402, height: 874 };

// Today, because a real save lands on the day the workspace opens on.
const TODAY = new Date().toLocaleDateString("en-CA");
// Deliberately old, fixed dates for the seeded states.
const SETTLED_DAY = "2026-05-29";     // saved by the captain, timestamp recorded
const MANAGER_DAY = "2026-05-28";     // same, saved by the manager
const NO_SAVER_DAY = "2026-05-27";    // saved before `updatedBy` was recorded
const NO_STAMP_DAY = "2026-05-26";    // saved before either field was recorded
const FLOOR_ONLY_DAY = "2026-05-25";  // a floor plan, never settled

// UTC instants, read back in whatever timezone the run happens to be in - so the
// tests assert the SHAPE of the time, never a hard-coded clock face.
const SETTLED_AT = "2026-05-30T03:14:00.000Z";
const MANAGER_AT = "2026-05-29T02:47:00.000Z";
const NO_SAVER_AT = "2026-05-28T04:05:00.000Z";

const PEOPLE = {
    manager: { email: "manager-savedby@example.com", firstName: "Mika", lastName: "Alvarez", role: "unassigned" },
    // A genuinely long name: this is what has to wrap gracefully on phones.
    captain: { email: "captain-savedby@example.com", firstName: "Nadia", lastName: "Whitfield-Okonkwo", role: "captain", isSupervisor: true },
    server: { email: "server-savedby@example.com", firstName: "Sam", lastName: "Ortiz", role: "server" },
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

// A settled day with real money on it. `saved` carries whatever the shift doc
// actually recorded about the last save - which is the whole subject here, so
// each caller states it explicitly, including "nothing".
async function seedSettledDay(db, date, saved = {}) {
    await setDoc(doc(db, `shifts/${date}`), {
        date,
        status: "closed",
        teams: [{
            teamId: "team-1",
            members: [
                { uid: uids.captain, name: "Nadia Whitfield-Okonkwo", role: "captain", points: 4 },
                { uid: uids.server, name: "Sam Ortiz", role: "server", points: 4 },
            ],
            pools: { sales: "1000", tips: "200", gratuity: "100", cash: "50" },
        }],
        barTeam: { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } },
        runners: [],
        summary: { balances: { overallBalance: 0 } },
        firstClosedAt: `${date}T02:00:00.000Z`,
        ...saved,
    });
    await setDoc(doc(db, "payouts", date), { date, ledgerVersion: 1 });
    await setDoc(doc(db, "payouts", date, "entries", uids.captain), {
        date, uid: uids.captain, name: "Nadia Whitfield-Okonkwo", role: "captain",
        tips: 92, gratuity: 28.8, cash: 19.2, total: 120.8, ledgerVersion: 1, source: "closeout",
    });
    await setDoc(doc(db, "payouts", date, "entries", uids.server), {
        date, uid: uids.server, name: "Sam Ortiz", role: "server",
        tips: 92, gratuity: 28.8, cash: 19.2, total: 120.8, ledgerVersion: 1, source: "closeout",
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

        // The manager tier is live, so the line's audience can be checked from
        // both sides of it in one seed.
        await setDoc(doc(db, "restaurant/config"), { managerUid: uids.manager });

        await seedSettledDay(db, SETTLED_DAY, { updatedBy: uids.captain, updatedAt: SETTLED_AT });
        await seedSettledDay(db, MANAGER_DAY, { updatedBy: uids.manager, updatedAt: MANAGER_AT });
        // A night from before `updatedBy` was recorded: a timestamp, nobody to name.
        await seedSettledDay(db, NO_SAVER_DAY, { updatedAt: NO_SAVER_AT });
        // A night from before either field existed.
        await seedSettledDay(db, NO_STAMP_DAY, {});

        await setDoc(doc(db, `shifts/${FLOOR_ONLY_DAY}`), {
            date: FLOOR_ONLY_DAY,
            status: "setup",
            teams: [{
                teamId: "team-1",
                members: [{ uid: uids.server, name: "Sam Ortiz", role: "server", points: 4 }],
                pools: { sales: "", tips: "", gratuity: "", cash: "" },
            }],
            barTeam: { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } },
            runners: [],
            updatedBy: uids.manager,
            updatedAt: NO_SAVER_AT,
        });
    });
}

// The Shifts-tab date is an aria-hidden native date input overlaid on the app
// bar's day pill, so it is driven by value + change.
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
    // The app bar is up on both halves of the app and at every day stage, so it
    // is what "logged in" means here. Not the Day steps rail: a landing with no
    // floor plan yet hides it (DayRailLanding), and today is usually blank.
    await expect(page.getByRole("button", { name: /^Account:/ })).toBeVisible();
}

// The captain lands on their own pay; the workspace is one tap away in the
// account sheet, which is the only place a phone keeps destinations.
async function crossToShifts(page) {
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: /^Shifts/ }).click();
}

// The page header a settled day carries - the real date, above the day chips.
const panelHeader = (page) => page.getByTestId("settled-day-header");
const savedByLine = (page) => panelHeader(page).locator("p");
const payoutPanel = (page) => panelHeader(page).locator("xpath=..");

// "Mon D, YYYY, H:MM AM/PM" - the full date, because a correction can be saved
// days after the night it belongs to.
const WHEN = String.raw`\w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM)`;

async function openSettledDay(page, date) {
    await setShiftDate(page, date);
    await expect(panelHeader(page)).toBeVisible();
}

async function openTeamPicker(page, teamName) {
    await page.getByRole("button", { name: new RegExp(`Add employees to ${teamName}`, "i") }).click();
    await expect(page.getByRole("dialog", { name: new RegExp(`Add employees to ${teamName}`, "i") })).toBeVisible();
}

async function assignFromPicker(page, name) {
    const picker = page.getByRole("dialog", { name: /Add employees to/i });
    await expect(picker).toBeVisible();
    await picker.locator(`[title^="Assign ${name} to "]`).click();
}

async function closeTeamPicker(page) {
    await page.getByRole("dialog", { name: /Add employees to/i }).getByRole("button", { name: "Close employee picker" }).click();
    await expect(page.getByRole("dialog", { name: /Add employees to/i })).toHaveCount(0);
}

test.beforeAll(async () => {
    mkdirSync(SHOTS_DIR, { recursive: true });
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

// The end-to-end shape of it: settle a night through the UI, and the day you
// land back on tells you who just saved it. Nothing seeded the attribution -
// the save wrote it and the panel read it back.
test("settling a night through the UI leaves the day naming who saved it", async ({ page }) => {
    // Built at desktop width - the phone floor plan assigns through its own
    // picker sheet, which is another spec's subject - then read back on a phone,
    // which is where the line has to hold up.
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, "manager");
    await setShiftDate(page, TODAY);

    await page.getByRole("button", { name: /Build floor plan/i }).click();
    await expect(page.getByRole("button", { name: /Add employees to Bar Team/i })).toBeVisible();
    await openTeamPicker(page, "Team 1");
    // The pool assigns by first name.
    await assignFromPicker(page, "Nadia");
    await assignFromPicker(page, "Sam");
    await closeTeamPicker(page);

    const rail = page.getByRole("navigation", { name: "Day steps" });
    await rail.getByRole("button", { name: "Settle" }).click();
    await page.getByRole("spinbutton", { name: "Sales", exact: true }).fill("1000");
    await page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true }).fill("200");
    await page.getByRole("spinbutton", { name: "Gratuity", exact: true }).fill("100");
    await page.getByRole("spinbutton", { name: "Cash", exact: true }).fill("50");
    // Confirm & Save stays locked until Team 1 (the only gated group here, no
    // Bar members) is marked done; Save and Mark Done returns to the who's-left
    // landing, whose footer then hands off straight into Review.
    await page.getByRole("button", { name: "Save and Mark Done" }).click();
    await page.getByRole("button", { name: "All groups closed - Review →" }).click();
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();

    // Back on the day, with the money - and now with the attribution.
    await expect(panelHeader(page)).toBeVisible();
    await page.setViewportSize(PHONE);
    await expect(savedByLine(page)).toHaveText(new RegExp(`^Saved by Mika Alvarez · ${WHEN}$`));

    // It is the LAST save that is claimed, never the settle-up, because the
    // record only supports that: "Settled by" would be a stronger claim than
    // `updatedAt` can carry once a night is corrected.
    await expect(payoutPanel(page)).not.toContainText("Settled by");

    await page.screenshot({ path: `${SHOTS_DIR}/after-real-save-phone.png`, fullPage: true });
});

// The manager and a captain meet the same line. The workspace gate is already
// the audience, so there is no second, narrower one - and the captain's own
// rules have to let them read the saver's profile, or the name never lands.
test("the manager and a captain both see the same saved-by line, by name", async ({ page }) => {
    await page.setViewportSize(PHONE);
    const expected = new RegExp(`^Saved by Nadia Whitfield-Okonkwo · ${WHEN}$`);

    await login(page, "manager");
    await openSettledDay(page, SETTLED_DAY);
    await expect(savedByLine(page)).toHaveText(expected);
    const asManager = await savedByLine(page).innerText();
    await page.screenshot({ path: `${SHOTS_DIR}/settled-day-manager-phone.png`, fullPage: true });

    // Never the raw uid, on either screen.
    await expect(payoutPanel(page)).not.toContainText(uids.captain);

    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: "Log Out" }).click();

    await login(page, "captain");
    await crossToShifts(page);
    // The workspace opens on today, which this seed leaves blank, so the landing
    // is the build-the-floor hero and not the rail.
    await expect(page.getByRole("heading", { name: "Let's set up the floor" })).toBeVisible();
    await openSettledDay(page, SETTLED_DAY);
    await expect(savedByLine(page)).toHaveText(expected);
    await expect(payoutPanel(page)).not.toContainText(uids.captain);
    expect(await savedByLine(page).innerText()).toBe(asManager);
    await page.screenshot({ path: `${SHOTS_DIR}/settled-day-captain-phone.png`, fullPage: true });

    // And an ordinary employee meets none of it - not because the line asks a
    // narrower question, but because the workspace it lives in is the audience.
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: "Log Out" }).click();

    await login(page, "server");
    await expect(page.getByTestId("pay-statement")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Day steps" })).toHaveCount(0);
    await expect(page.getByText(/^Saved by /)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS_DIR}/employee-sees-no-line-phone.png`, fullPage: true });
});

// Older nights are ordinary nights. Nothing here is an incident.
test("older nights state only what was recorded, with nothing warning-toned about it", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, "manager");

    // A saver was never recorded: the time alone, and no apology for the rest.
    await openSettledDay(page, NO_SAVER_DAY);
    await expect(savedByLine(page)).toHaveText(new RegExp(`^Saved ${WHEN}$`));
    await expect(payoutPanel(page)).not.toContainText(/unknown|missing|not recorded|unavailable|no record/i);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS_DIR}/no-saver-recorded-phone.png`, fullPage: true });

    // No timestamp at all: no line, rather than a line about not having one.
    await openSettledDay(page, NO_STAMP_DAY);
    await expect(savedByLine(page)).toHaveCount(0);
    await expect(payoutPanel(page)).not.toContainText("Saved");
    await page.screenshot({ path: `${SHOTS_DIR}/no-timestamp-recorded-phone.png`, fullPage: true });

    // A floor plan that was never settled has no money and no saved-by line -
    // the shift doc carries both fields, but there is no settled day to caption.
    // Direction A: this setup day with an existing floor plan lands on the
    // who's-left checklist, not an auto-redirect into the floor editor.
    await setShiftDate(page, FLOOR_ONLY_DAY);
    await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Floor" }).click();
    await expect(page.getByRole("button", { name: /Add employees to Team 1/i })).toBeVisible();
    await expect(panelHeader(page)).toHaveCount(0);
    await expect(page.getByText(/^Saved by /)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS_DIR}/floor-plan-only-phone.png`, fullPage: true });
});

// The failure this guards is a frame, not an end state: the shift doc and the
// resolved name land in separate renders, so a day change can briefly show the
// new day's timestamp under the previous day's saver. Every intermediate text
// the line takes is recorded here, and each one has to be self-consistent.
test("browsing between days never shows one night's saver against another's timestamp", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, "manager");

    await openSettledDay(page, SETTLED_DAY);
    await expect(savedByLine(page)).toContainText("Nadia Whitfield-Okonkwo");

    // Record every text the saved-by line holds while the day changes under it.
    await page.evaluate(() => {
        window.__savedByFrames = [];
        const record = () => {
            document.querySelectorAll("header p").forEach((p) => {
                const text = p.textContent || "";
                if (text.startsWith("Saved")) window.__savedByFrames.push(text);
            });
        };
        record();
        window.__savedByObserver = new MutationObserver(record);
        window.__savedByObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await setShiftDate(page, MANAGER_DAY);
    await expect(savedByLine(page)).toContainText("Mika Alvarez");
    const frames = await page.evaluate(() => {
        window.__savedByObserver.disconnect();
        return window.__savedByFrames;
    });

    // Every frame the line was ever in has to be one night's own record: this
    // night's saver next to this night's time, or the honest nameless form.
    const dayOf = (iso) => new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
    for (const text of frames) {
        if (text.includes("Nadia Whitfield-Okonkwo")) expect(text).toContain(dayOf(SETTLED_AT));
        if (text.includes("Mika Alvarez")) expect(text).toContain(dayOf(MANAGER_AT));
    }
    // ...and the crossing really was observed, so the loop above was not vacuous.
    expect(frames.some((t) => t.includes("Mika Alvarez"))).toBe(true);
});

// The supported phone floor still leaves this line as a footnote, and a clock
// time is not a thing you may break in half.
test("at the supported phone floor the line stays a footnote and the time never breaks across lines", async ({ page }) => {
    await page.setViewportSize(NARROW_PHONE);
    await login(page, "manager");
    await openSettledDay(page, SETTLED_DAY);

    const line = savedByLine(page);
    await expect(line).toContainText("Nadia Whitfield-Okonkwo");

    // Quieter than the date it sits under, and not competing with the money.
    // The date moved into AdminDashboard's own page header (above the day-chip
    // strip, not inside the payout card) and is that header's real <h1> now.
    const dateHeading = panelHeader(page).getByRole("heading", { level: 1 });
    const [lineSize, headingSize] = await Promise.all([
        line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        dateHeading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ]);
    expect(lineSize).toBeLessThan(headingSize);

    // The timestamp comes through in one piece, so any break falls at the separator.
    const timeRects = await line.locator("span").evaluate((el) => el.getClientRects().length);
    expect(timeRects).toBe(1);

    // The drive-by fix this pinned: the header used to carry its own px-6/px-4
    // padding while the money below it used a different value, so the date hung
    // 8px right of it. Both now inherit the SAME shared padding from the page's
    // `main` wrapper instead of setting their own - so this checks they agree
    // with each other rather than pinning one hardcoded pixel value.
    const panelBody = panelHeader(page).locator("xpath=following-sibling::div[1]");
    const [headerPaddingLeft, bodyPaddingLeft] = await Promise.all([
        panelHeader(page).evaluate((el) => getComputedStyle(el).paddingLeft),
        panelBody.evaluate((el) => getComputedStyle(el).paddingLeft),
    ]);
    expect(headerPaddingLeft).toBe(bodyPaddingLeft);

    await page.screenshot({ path: `${SHOTS_DIR}/settled-day-supported-phone.png`, fullPage: true });

    // Desktop keeps its roomier header, still in step with the money.
    await page.setViewportSize({ width: 1280, height: 900 });
    const [desktopHeaderPaddingLeft, desktopBodyPaddingLeft] = await Promise.all([
        panelHeader(page).evaluate((el) => getComputedStyle(el).paddingLeft),
        panelBody.evaluate((el) => getComputedStyle(el).paddingLeft),
    ]);
    expect(desktopHeaderPaddingLeft).toBe(desktopBodyPaddingLeft);
    await page.screenshot({ path: `${SHOTS_DIR}/settled-day-desktop.png`, fullPage: true });
});
