import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

// The night itself, driven through the real UI: Floor plan -> Settle up -> Review,
// the money Review shows and what it refuses to show while something is missing,
// the payout ledger a save writes, and correcting or removing a day afterwards.
// The mobile blocks below are part of the same job rather than decoration - the
// floor is built and settled on a phone, so the in-place editor, the leave guard
// on a half-finished edit, and the supported-width app bar are money-losing paths
// when they break, not cosmetics.

const PROJECT_ID = "demo-tip-tracker-test";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "Password123!";
const SHIFT_DATE = "2026-05-29";
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const SUPPORTED_PHONE_VIEWPORTS = [
    { name: "iphone-17-pro", width: 402, height: 874 },
    { name: "iphone-17-pro-max", width: 440, height: 956 },
];

// The Firebase CLI exports this for emulators:exec; fall back to the default auth port.
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

let testEnv;

async function createAuthUser({ email, password, displayName }) {
    const response = await fetch(
        `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
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
    await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
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
            firstName: "Admin",
            lastName: "",
            email: ADMIN_EMAIL,
            role: "admin",
            status: "active",
        });

        await setDoc(doc(db, "users/captainUid"), {
            uid: "captainUid",
            username: "Captain One",
            firstName: "Captain One",
            lastName: "",
            email: "captain@example.com",
            role: "captain",
            status: "active",
        });

        await setDoc(doc(db, "users/serverUid"), {
            uid: "serverUid",
            username: "Server One",
            firstName: "Server One",
            lastName: "",
            email: "server@example.com",
            role: "server",
            status: "active",
        });

        await setDoc(doc(db, "users/backUid"), {
            uid: "backUid",
            username: "Back One",
            firstName: "Back One",
            lastName: "",
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

// Seed the shape `migrate:payout-ledger` leaves behind: ledger meta + entries for
// a date, with NO shifts/{date} doc. Mirrors the migration's own write (a
// `source: "migration"` entry), which is where this state comes from in practice.
async function seedOrphanedPayouts(date) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        await setDoc(doc(db, "payouts", date), {
            date,
            ledgerVersion: 1,
            updatedBy: "migration",
        });
        await setDoc(doc(db, "payouts", date, "entries", "backUid"), {
            date, uid: "backUid", name: "Back One", role: "back",
            tips: 40, gratuity: 20, cash: 16, total: 60, ledgerVersion: 1, source: "migration",
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
    // Today is usually a blank day, so the rail is hidden (build-floor and
    // closed landings both drop it). Wait for the workspace itself.
    await expect(
        page.getByRole("heading", { name: "Let's set up the floor" })
            .or(page.getByRole("navigation", { name: "Day steps" }))
            .or(page.getByRole("button", { name: "Edit shift" }))
    ).toBeVisible();
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
    await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add employees to Team 1/i })).toBeVisible();
}

// Assign a seeded pool employee to the currently opened floor-plan picker.
async function assignFromPool(page, name) {
    const picker = page.getByRole("dialog", { name: /Add employees to/i });
    await expect(picker).toBeVisible();
    await picker.locator(`[title^="Assign ${name} to "]`).click();
}

async function openTeamPicker(page, teamName) {
    await page.getByRole("button", { name: new RegExp(`Add employees to ${teamName}`, "i") }).click();
    await expect(page.getByRole("dialog", { name: new RegExp(`Add employees to ${teamName}`, "i") })).toBeVisible();
}

async function closeTeamPicker(page) {
    await page.getByRole("dialog", { name: /Add employees to/i }).getByRole("button", { name: "Close employee picker" }).click();
    await expect(page.getByRole("dialog", { name: /Add employees to/i })).toHaveCount(0);
}

// Setup-shift Settle up flow. Floor and money are directly editable and autosave;
// Review is reached from the day rail because it derives from the live inputs.
//
// Parallel Settle up's close gate (Direction A, 2026-08-23 lock): Confirm & Save
// stays locked until every assigned dining team and Bar are marked done, so this
// helper's callers all assign a single dining team (no Bar members) and need
// Save and Mark Done, floated bottom-right, before Review offers an enabled
// Confirm & Save Shift. Friendly entry (Path 3, 2026-08-24 lock): Save and Mark
// Done itself returns to the who's-left landing rather than staying in Settle
// up - with the only gated group now done, its footer swaps to a direct
// "All groups closed - Review ->" handoff, which this helper follows instead
// of the day rail's own Review step (that rail no longer exists on screen once
// the mark-done write lands).
async function settleMoneyAndReview(page, { sales, tips, gratuity, cash }) {
    const rail = page.getByRole("navigation", { name: "Day steps" });
    await rail.getByRole("button", { name: "Settle" }).click();

    await page.getByRole("spinbutton", { name: "Sales", exact: true }).fill(sales);
    await page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true }).fill(tips);
    await page.getByRole("spinbutton", { name: "Gratuity", exact: true }).fill(gratuity);
    await page.getByRole("spinbutton", { name: "Cash", exact: true }).fill(cash);
    // Wait for the whole-shift roster autosave to land before marking done: the
    // landing this returns to re-reads the shift doc, and racing that read
    // against an in-flight first autosave (blank day -> "setup") can catch it
    // before the floor plan just assigned is on the doc at all. Autosave is
    // silent on screen (no "Draft saved." hint), so poll the shift doc itself
    // for the money that was just typed rather than any on-screen cue.
    let savedSales;
    await expect.poll(async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const shiftDoc = await getDoc(doc(context.firestore(), `shifts/${SHIFT_DATE}`));
            savedSales = shiftDoc.data()?.teams?.[0]?.pools?.sales;
        });
        return savedSales;
    }).toBe(sales);
    await page.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: "All groups closed - Review →" }).click();
    await expect(page.getByRole("button", { name: "Confirm & Save Shift" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page, width) {
    await expect.poll(() => page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        appBarRight: Math.round(document.querySelector("header").getBoundingClientRect().right),
    }))).toEqual({
        documentWidth: width,
        bodyWidth: width,
        appBarRight: width,
    });
}

async function expectSettledLanding(page) {
    await expect(page.getByTestId("settled-day-header")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payout" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit shift" })).toBeVisible();
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

// THE friction the captain reported: you reach Review, notice somebody missing from
// the floor plan, go add them - and then cannot get back to Review from the rail. The
// old model snapshotted the calculation into state and nulled it on any edit, so adding
// the person made Review unreachable until you walked back through Settle up and pressed
// Calculate Payouts again. Review now derives from the live inputs, so the rail walks
// straight back and the numbers have already moved.
test("Review is reachable from the rail after a floor-plan edit, without revisiting Settle up", async ({ page }) => {
    await login(page);
    await setShiftDate(page, SHIFT_DATE);
    await openEditor(page);

    await openTeamPicker(page, "Team 1");
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    await closeTeamPicker(page);

    await settleMoneyAndReview(page, { sales: "1000", tips: "200", gratuity: "100", cash: "50" });

    const rail = page.getByRole("navigation", { name: "Day steps" });
    const totals = page.getByRole("button", { name: /Shift totals/ });
    // The spot-check card's CTP is the FIRST money-shaped string on this screen, so
    // assert on the tagged figures instead of "the first thing that looks like money".
    const everyonePaid = page.getByTestId("totals-everyone-paid");
    const captainTotal = page.getByTestId("spot-check-total");

    // The floor, and the captain's own total, as they stand before the edit.
    await expect(page.getByRole("button", { name: /Who's on the floor/ })).toContainText("2 people");
    await totals.click();
    const paidBefore = await everyonePaid.textContent();
    const captainBefore = await captainTotal.textContent();
    await totals.click();

    // Review -> Floor plan, add the missing person.
    await rail.getByRole("button", { name: "Floor" }).click();
    await openTeamPicker(page, "Team 1");
    await assignFromPool(page, "Back One");
    await closeTeamPicker(page);

    // ...and straight back to Review from the rail. No Settle up detour, no Calculate.
    await rail.getByRole("button", { name: "Review" }).click();
    await expect(page.getByRole("button", { name: "Confirm & Save Shift" })).toBeVisible();

    // The new person is on the floor...
    await expect(page.getByRole("button", { name: /Who's on the floor/ })).toContainText("3 people");
    await page.getByRole("button", { name: /Who's on the floor/ }).click();
    await expect(page.getByText("Captain One · Server One · Back One")).toBeVisible();
    await page.getByRole("button", { name: /Who's on the floor/ }).click();

    // ...the same pool is still being handed out (nobody's money appeared or vanished)...
    await totals.click();
    await expect(everyonePaid).toHaveText(paidBefore);
    // ...but it is now split more ways, which is the proof Review recalculated from the
    // edit rather than replaying the figures it was opened with.
    await expect(captainTotal).not.toHaveText(captainBefore);
});

// Review must never dress up an incomplete shift as a finished one. Reaching it is
// free (that is the whole fix); what it SHOWS when the inputs are thin is the guard.
test("Review names what is missing instead of showing a total, and offers no save", async ({ page }) => {
    await login(page);
    await setShiftDate(page, SHIFT_DATE);
    await openEditor(page);

    await openTeamPicker(page, "Team 1");
    await assignFromPool(page, "Captain One");
    await closeTeamPicker(page);

    // Staff on the floor, no money entered: the rail still walks to Review.
    await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Review" }).click();

    await expect(page.getByText("No payouts to review yet")).toBeVisible();
    await expect(page.getByText(/Enter at least one sales, tip, gratuity/)).toBeVisible();
    // No total, and nothing to commit.
    await expect(page.getByRole("button", { name: /Shift totals/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm & Save Shift" })).toHaveCount(0);
});

// Runner pay is drawn OUT of the tip pool, so listing it as money the captain entered
// overstated the pool. It belongs with the subtractions.
test("Review lists no runners as entered money and shows their pay as a deduction", async ({ page }) => {
    await login(page);
    await setShiftDate(page, SHIFT_DATE);
    await openEditor(page);

    await openTeamPicker(page, "Team 1");
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    // Back One as the runner: this spec seeds only Admin / Captain One / Server One /
    // Back One, so there is no dedicated runner account to reach for here.
    //
    // Match "+ Add" too. The floor plan also has a role-FILTER tab bar (Captains /
    // Servers / ... / Runners / Temp) whose "Runners" tab is a button with the same
    // bare name; hitting that filters the pool to role=runner - empty in this seed -
    // instead of selecting the group to assign into.
    await closeTeamPicker(page);
    await openTeamPicker(page, "Runners");
    await assignFromPool(page, "Back One");
    await closeTeamPicker(page);

    await settleMoneyAndReview(page, { sales: "1000", tips: "200", gratuity: "100", cash: "50" });

    // "Money you entered" covers the funding groups only - Team 1 and Bar Team.
    const money = page.getByRole("button", { name: /Money you entered/ });
    await expect(money).toContainText("2 groups");
    await money.click();
    await expect(page.getByText("Runners", { exact: true })).toHaveCount(0);
    await money.click();

    // The runners appear where a subtraction belongs.
    const floor = page.getByRole("button", { name: /Who's on the floor/ });
    await floor.click();
    await expect(page.getByText("off the pool")).toBeVisible();
    await floor.click();

    // Shift totals shows runner pay as a deduction from the dining pool, and keeps the
    // dining and bar pools as separate destinations - no figure labelled as the floor
    // may carry bar money, and the all-in total is never presented undecomposed.
    await page.getByRole("button", { name: /Shift totals/ }).click();
    await expect(page.getByText("paid off the top")).toBeVisible();
    await expect(page.getByTestId("totals-dining")).toBeVisible();
    await expect(page.getByTestId("totals-bar")).toBeVisible();
    await expect(page.getByTestId("totals-runners")).not.toHaveText("$0.00");
    await expect(page.getByText("= Everyone paid")).toBeVisible();
    await expect(page.getByText("Split among the floor")).toHaveCount(0);
});

test("admin can close out a simple dining room shift and create ledger payout records", async ({ page }) => {
    await login(page);
    await setShiftDate(page, SHIFT_DATE);
    await openEditor(page);

    // Floor plan: select Team 1, then click-to-assign three dining employees.
    await openTeamPicker(page, "Team 1");
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    await assignFromPool(page, "Back One");
    await closeTeamPicker(page);

    // Settle up mirrors the floor plan: enter the money in place, then walk the rail
    // to Review.
    await settleMoneyAndReview(page, { sales: "1000", tips: "200", gratuity: "100", cash: "50" });

    // Review is a spot check on ONE person - the first captain at full points - not a
    // roster dump, so only that person is named up front. Their CTP/GRT/Cash/Total are
    // what gets compared against the restaurant's spreadsheet by eye.
    await expect(page.getByText("Captain One").last()).toBeVisible();
    // Total is CTP + GRT; cash is never folded into it.
    await expect(page.getByText("CTP + GRT")).toBeVisible();

    // Everyone else is one tap away, in the read-only floor rung.
    await page.getByRole("button", { name: /Who's on the floor/ }).click();
    await expect(page.getByText("Captain One · Server One · Back One")).toBeVisible();

    await page.getByRole("button", { name: /Confirm & Save Shift/ }).click();
    // On save the editor returns to the paid-out landing.
    await expectSettledLanding(page);

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

        // What actually landed in the ledger for a dining employee, after a real
        // settle in a real browser. `total` is CTP + GRT; the $50 of cash entered
        // at Settle up is stored on its own and is NOT inside the total. This is
        // the end-user-visible contract - the stored record has to agree with the
        // Total (CTP + GRT) the captain just eyeballed on Review.
        [captainPayout, serverPayout, backPayout].forEach((payoutDoc) => {
            const payout = payoutDoc.data();
            expect(payout.total).toBeCloseTo(payout.tips + payout.gratuity, 2);
        });
        const captain = captainPayout.data();
        // Teeth: a dining payout really does carry cash here, so the assertion
        // above cannot pass just because every figure happened to be zero.
        expect(captain.cash).toBeGreaterThan(0);
        expect(captain.total).toBeGreaterThan(0);
        expect(captain.total).toBeLessThan(captain.tips + captain.gratuity + captain.cash);
        // The cash entered at Settle up is fully distributed, just not via `total`.
        const ledgerCash = [captainPayout, serverPayout, backPayout]
            .reduce((sum, payoutDoc) => sum + payoutDoc.data().cash, 0);
        expect(ledgerCash).toBeCloseTo(50, 2);
        expect(captainTip.exists()).toBe(false);
        expect(auditEvents.size).toBe(1);
    });
});

test("editing a closed shift's roster preserves payouts and cleans up the removed employee's ledger entry", async ({ page }) => {
    await login(page);
    await setShiftDate(page, SHIFT_DATE);
    await openEditor(page);

    await openTeamPicker(page, "Team 1");
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    await assignFromPool(page, "Back One");
    await closeTeamPicker(page);

    // Settle up mirrors the floor plan to reach Review, then confirm to close the shift.
    await settleMoneyAndReview(page, { sales: "1000", tips: "300", gratuity: "150", cash: "80" });
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    await expectSettledLanding(page);

    // Reopen the settled shift via the floating "Edit shift" -> the SAME new in-place
    // editor (no old view-only / "Edit roster" gate). The floor is directly editable.
    await page.getByRole("button", { name: "Edit shift" }).click();
    await expect(page.getByRole("button", { name: /Add employees to Bar Team/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit roster" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Back One" })).toBeVisible();
    await page.getByRole("button", { name: "Remove Back One" }).click();

    // The bare, non-merging "Save Team Setup" overwrite is not offered on a closed
    // shift; roster edits go through Review -> Confirm & Save.
    await expect(page.getByRole("button", { name: "Save Team Setup" })).toHaveCount(0);

    // Closed shift roster edits go straight through Review without an old lock step.
    await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Settle" }).click();
    await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Confirm & Save Shift" }).click();
    await expectSettledLanding(page);

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

// Orphaned payout ledger entries: `payouts/{date}/entries/*` with no shifts/{date}
// doc behind them. Only `migrate:payout-ledger` (which writes ledger entries and
// never shift docs) and unfinished writes leave this shape - the app's own settle
// path always writes both. It is real payroll data the employee can see, and it
// used to be unreachable in the admin UI: with no shift doc the day read as blank.
test("an accidental setup day can be removed from the floor plan", async ({ page }) => {
    const date = "2026-05-26";
    await seedSetupShift(date);

    let confirmMessage = "";
    page.on("dialog", (dialog) => {
        confirmMessage = dialog.message();
        return dialog.accept();
    });

    await page.goto("/");
    await page.getByLabel("Username or Email").fill(ADMIN_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("heading", { name: "Let's set up the floor" })).toBeVisible();

    await setShiftDate(page, date);

    // Direction A's who's-left checklist is the landing for a setup day with an
    // existing floor plan (no more auto-redirect into the floor editor) - reach
    // the floor editor through its own Day Rail step, same as the checklist's
    // own rail. The discard lives there, not on the closed-day danger zone, and
    // its confirm is the lighter copy.
    await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Floor plan" }).click();
    await expect(page.getByRole("button", { name: "Remove this day" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove this shift" })).toHaveCount(0);

    await page.getByRole("button", { name: "Remove this day" }).click();
    expect(confirmMessage).toContain("has not been paid out");
    expect(confirmMessage).not.toContain("This cannot be undone.");

    await expect(page.getByRole("heading", { name: "Let's set up the floor" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Build floor plan/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove this day" })).toHaveCount(0);

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const shiftDoc = await getDoc(doc(context.firestore(), `shifts/${date}`));
        expect(shiftDoc.exists()).toBe(false);
    });
});

test("a date with payout entries and no shift doc can be cleaned up from the day landing", async ({ page }) => {
    const date = "2026-05-25";
    await seedOrphanedPayouts(date);

    let confirmMessage = "";
    page.on("dialog", (dialog) => {
        confirmMessage = dialog.message();
        return dialog.accept();
    });

    await login(page);
    await setShiftDate(page, date);

    // The day names what it is holding - leftover payouts, not a settled shift -
    // and lists everyone the removal would un-pay, before offering the button.
    await expect(page.getByRole("heading", { name: "Leftover payouts, no shift" })).toBeVisible();
    await expect(page.getByText("Back One")).toBeVisible();
    await expect(page.getByText("$60.00")).toBeVisible();
    // It must not masquerade as a paid-out day: no shift means nothing to export.
    await expect(page.getByRole("button", { name: "Export PDF" })).toHaveCount(0);
    // The floor plan can still be built here, which is the other way out.
    await expect(page.getByRole("button", { name: /Build floor plan/i })).toBeVisible();

    await page.getByRole("button", { name: "Remove leftover payouts" }).click();

    // Same destructive confirm the closed-shift removal uses.
    expect(confirmMessage).toContain("This cannot be undone.");

    // Cleaned up, the date is an ordinary blank day again.
    await expect(page.getByRole("heading", { name: "Let's set up the floor" })).toBeVisible();

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const entries = await getDocs(collection(db, "payouts", date, "entries"));
        const meta = await getDoc(doc(db, "payouts", date));
        const auditEvents = await getDocs(collection(db, "auditEvents"));

        expect(entries.size).toBe(0);
        expect(meta.exists()).toBe(false);
        expect(auditEvents.size).toBe(1);
        const audit = auditEvents.docs[0].data();
        expect(audit.type).toBe("shift_removed");
        expect(audit.date).toBe(date);
        expect(audit.removedPayoutUids).toEqual(["backUid"]);
        expect(audit.previousPayoutCount).toBe(1);
    });
});

// The guard on the change above: only a date carrying leftover ledger entries
// becomes removable. Every other blank day in the calendar stays a blank day.
test("a date with no shift and no payout entries still opens on the empty day", async ({ page }) => {
    const date = "2026-05-26";
    await login(page);
    await setShiftDate(page, date);

    await expect(page.getByRole("heading", { name: "Let's set up the floor" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Danger zone" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
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
        await openTeamPicker(page, "Team 1");

        // Assign a member, then close the picker with Done.
        await assignFromPool(page, "Captain One");
        await closeTeamPicker(page);

        // Regression: before the fix the selection lingered, so this first tap only
        // silently deselected and the sheet stayed closed (it took a second tap).
        await page.getByRole("button", { name: /Add employees to Team 1/i }).click();
        await expect(page.getByRole("dialog", { name: /Add employees to Team 1/i })).toBeVisible();
    });

    test("setup floor plans open directly editable, and the rail moves to editable Settle", async ({ page }) => {
        const date = "2026-05-27";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        // Direction A: a setup shift with an existing floor plan lands on the
        // who's-left checklist, not an auto-redirect into the floor editor -
        // Floor plan is one rail tap away from there, same as Settle and Review.
        const rail = page.getByRole("navigation", { name: "Day steps" });
        await rail.getByRole("button", { name: "Floor" }).click();
        await expect(page.getByRole("button", { name: /Add employees to Team 1/i })).toBeVisible();
        await expect(page.getByRole("button", { name: "✎ Edit", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "✓ Done", exact: true })).toHaveCount(0);

        // Advancing to Settle shows editable money fields immediately.
        await rail.getByRole("button", { name: "Settle" }).click();
        await expect(page.getByRole("tab", { name: /Team 1/ })).toBeVisible();
        await expect(page.getByRole("spinbutton", { name: "Sales", exact: true })).toBeEnabled();
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
        await expect(page.getByRole("button", { name: "Edit roster" })).toHaveCount(0);
        await expect(page.getByText("The roster is view-only.")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Add restaurant team" })).toBeVisible();

        // The team card is directly editable: tap opens the assign sheet; add a member.
        await openTeamPicker(page, "Team 1");
        await assignFromPool(page, "Back One");
        await closeTeamPicker(page);

        // The overwrite warning appears on Review before anything is written.
        await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Review" }).click();
        await expect(page.getByText(/Re-saving overwrites the saved payouts/i)).toBeVisible();
        await expect(page.getByRole("button", { name: "Confirm & Save Shift" })).toBeVisible();
    });

    test("setup floor edits autosave the roster without a Done button", async ({ page }) => {
        const date = "2026-05-25";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        // Direction A: reach the floor editor from the who's-left checklist's
        // own Day Rail rather than an auto-redirect.
        await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Floor" }).click();
        await openTeamPicker(page, "Team 1");
        await assignFromPool(page, "Back One");
        await closeTeamPicker(page);

        await expect.poll(async () => {
            let memberUids = [];
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const shiftDoc = await getDoc(doc(context.firestore(), `shifts/${date}`));
                memberUids = shiftDoc.data().teams[0].members.map((member) => member.uid);
            });
            return memberUids;
        }).toEqual(["captainUid", "serverUid", "backUid"]);
    });

    test("closed shift edit: leaving through Home with confirmed discard keeps the saved shift", async ({ page }) => {
        const date = "2026-05-24";
        await seedClosedShift(date);

        // A closed shift disables draft autosave, so an in-progress roster edit only
        // persists through Confirm & Save. Leaving the editor guards that discard.
        page.on("dialog", (dialog) => dialog.accept());

        await login(page);
        await setShiftDate(page, date);

        await page.getByRole("button", { name: "Edit shift" }).click();
        await expect(page.getByRole("button", { name: /Add employees to Team 1/i })).toBeVisible();

        // Add a member so there is an uncommitted change to discard.
        await openTeamPicker(page, "Team 1");
        await assignFromPool(page, "Back One");
        await closeTeamPicker(page);

        // Home -> accept the discard -> back on today's shifts, nothing written.
        await page.getByRole("button", { name: "Go to today's shifts" }).click();
        await expect(page.locator('input[type="date"]').first()).toHaveValue(
            new Date().toLocaleDateString("en-CA")
        );

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

    // A phone has no top-level nav at all. The top level had one real destination
    // (Shifts, which IS the app) and one occasional one (Team), and saying so cost a
    // 90px banded menu behind a hamburger - 24% of a 390x844 screen to reveal two
    // items, one of which was always the screen you were already on. Team moved into
    // the account sheet; the Day Rail is the only navigation left on a phone.
    test("no workspace menu on a phone: Team lives in the account sheet, the Day Rail is the nav", async ({ page }) => {
        const date = "2026-05-31";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        // No hamburger, and the workspace sidebar does not render at this width.
        await expect(page.getByRole("button", { name: /workspace navigation/i })).toHaveCount(0);
        await expect(page.locator("aside")).toBeHidden();
        await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();

        // Team is still two taps away - through the account sheet, not a menu band.
        await page.getByRole("button", { name: /Open account menu/ }).click();
        await page.getByRole("menuitem", { name: "Team" }).click();
        await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();

        // ...and the app bar's home control is the way back out of it. Home is
        // today, which is blank here, so what proves you are back on Shifts is
        // the build-the-floor landing - the rail is hidden until a floor exists.
        await page.getByRole("button", { name: "Go to today's shifts" }).click();
        await expect(page.getByRole("heading", { name: "Let's set up the floor" })).toBeVisible();
    });

    // The nav used to live outside the editor's state machine: Cancel confirmed a
    // discard on a paid-out shift while the workspace menu and the app bar just
    // switched tabs, so the same unsaved money edit was thrown away with no prompt.
    // Every exit now passes the same guard.
    test("closed shift edit: home and the account sheet warn like Cancel instead of discarding silently", async ({ page }) => {
        const date = "2026-05-22";
        await seedClosedShift(date);

        let dialogs = 0;
        let answer = "dismiss";
        page.on("dialog", (dialog) => {
            dialogs += 1;
            expect(dialog.message()).toContain("Discard your changes to this closed shift?");
            return answer === "accept" ? dialog.accept() : dialog.dismiss();
        });

        await login(page);
        await setShiftDate(page, date);
        await page.getByRole("button", { name: "Edit shift" }).click();
        await expect(page.getByRole("button", { name: /Add employees to Team 1/i })).toBeVisible();

        // Add a member so there is uncommitted work that leaving would drop.
        await openTeamPicker(page, "Team 1");
        await assignFromPool(page, "Back One");
        await closeTeamPicker(page);

        // Home, dismissed: the edit survives and the editor stays open.
        await page.getByRole("button", { name: "Go to today's shifts" }).click();
        await expect(page.getByRole("button", { name: /Remove Back One/i })).toBeVisible();
        expect(dialogs).toBe(1);

        // Account sheet -> Team, dismissed: same guard, same outcome. This is the
        // only nav that exits the editor on a phone now that the workspace menu is
        // gone, so it is the path that has to keep clearing the guard.
        await page.getByRole("button", { name: /Open account menu/ }).click();
        await page.getByRole("menuitem", { name: "Team" }).click();
        await expect(page.getByRole("button", { name: /Remove Back One/i })).toBeVisible();
        expect(dialogs).toBe(2);

        // Home, confirmed: the edit is discarded and home lands on TODAY's shifts,
        // not the closed day that was being edited.
        answer = "accept";
        await page.getByRole("button", { name: "Go to today's shifts" }).click();
        await expect(page.getByRole("button", { name: /Remove Back One/i })).toHaveCount(0);
        await expect(page.locator('input[type="date"]').first()).toHaveValue(
            new Date().toLocaleDateString("en-CA")
        );

        // Nothing was written either way - the paid-out shift is untouched.
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const shiftDoc = await getDoc(doc(db, `shifts/${date}`));
            const memberUids = shiftDoc.data().teams[0].members.map((member) => member.uid);
            expect(memberUids).not.toContain("backUid");
            expect((await getDoc(doc(db, "payouts", date, "entries", "backUid"))).exists()).toBe(false);
        });
    });

    test("Settle up is directly editable and the typed draft persists", async ({ page }) => {
        const date = "2026-05-23";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Settle" }).click();
        const sales = page.getByRole("spinbutton", { name: "Sales", exact: true });
        await expect(sales).toBeVisible();
        await expect(sales).toBeEnabled();
        await sales.fill("500");
        await expect(page.getByRole("spinbutton", { name: "Sales", exact: true })).toHaveValue("500");

        await expect.poll(async () => {
            let value = "";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const shiftDoc = await getDoc(doc(context.firestore(), `shifts/${date}`));
                value = shiftDoc.data().teams[0].pools.sales;
            });
            return value;
        }).toBe("500");
    });

    test("Settle up edits feed Review without Calculate or Done", async ({ page }) => {
        const date = "2026-05-22";
        await seedSetupShift(date);
        await login(page);
        await setShiftDate(page, date);

        await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Settle" }).click();
        const tips = page.getByRole("spinbutton", { name: "Tips (CTP)", exact: true });
        await tips.fill("500");

        await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Review" }).click();
        await expect(page.getByText("No payouts to review yet")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Confirm & Save Shift" })).toBeVisible();
        await expect(page.getByRole("button", { name: /Calculate/i })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "✓ Done", exact: true })).toHaveCount(0);
    });
});

// The app bar at the supported phone widths. Log Out used to take too much room
// for a once-a-shift action and, on the money screen, was the only word-labelled
// control on screen; the day being edited was not rendered at all on a phone
// while desktop showed it.
test.describe("app bar at supported phone widths", () => {
    test.use({ viewport: SUPPORTED_PHONE_VIEWPORTS[0] });

    test("the date pill dispatches the native input click before showPicker", async ({ page }) => {
        await login(page);

        const input = page.locator('header input[type="date"]');
        await input.evaluate((el) => {
            window.__barDatePickerCalls = [];
            el.focus = () => window.__barDatePickerCalls.push("focus");
            el.click = () => window.__barDatePickerCalls.push("click");
            el.showPicker = () => window.__barDatePickerCalls.push("showPicker");
        });

        await page.getByRole("button", { name: /^Shift date:/ }).click();

        // Playwright does not run iOS Safari and cannot prove that its native
        // picker appeared. This pins the activation order proven in the real
        // simulator: WebKit's exposed showPicker() can silently do nothing, so
        // the native input click must happen first.
        await expect.poll(() => page.evaluate(() => window.__barDatePickerCalls))
            .toEqual(["focus", "click", "showPicker"]);
    });

    test("prev/next step the day beside the pill, and the three still fit at the phone floor", async ({ page }) => {
        await login(page);
        await setShiftDate(page, "2026-05-24");

        // A day screen steps a DAY. Both directions, because an off-by-one that
        // only shows up going back is exactly the shape this control invites.
        await page.getByRole("button", { name: "Previous day" }).click();
        await expect(page.getByRole("button", { name: /^Shift date:/ })).toHaveText(/May 23/);
        await page.getByRole("button", { name: "Next day" }).click();
        await page.getByRole("button", { name: "Next day" }).click();
        await expect(page.getByRole("button", { name: /^Shift date:/ })).toHaveText(/May 25/);

        // The calendar is an ADDITION-free survivor: stepping never replaced it.
        await expect(page.locator('header input[type="date"]')).toHaveCount(1);

        // Three segments plus home plus the account avatar must not push the page sideways.
        await expectNoHorizontalOverflow(page, SUPPORTED_PHONE_VIEWPORTS[0].width);
    });

    test("the editor shows the day being edited, as a label the bar cannot change mid-edit", async ({ page }) => {
        const date = "2026-05-24";
        await login(page);
        await setShiftDate(page, date);

        // Shifts: the day IS the control that changes the day.
        await expect(page.locator('input[type="date"]')).toHaveCount(1);

        await openEditor(page);

        // Editor: the day is on screen at all - this is the money-correctness half.
        const dayLabel = page.getByTestId("editor-day-label");
        await expect(dayLabel).toBeVisible();
        await expect(dayLabel).toHaveText(/May 24/);

        // ...and it is a label, not a control: nothing here can swap the date under
        // a half-entered shift. That covers BOTH ways the pill can move a day -
        // the calendar behind it and the prev/next steps beside it. Prev/next must
        // never become a back door around the one rule this label exists for.
        await expect(page.locator('input[type="date"]')).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Previous day" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Next day" })).toHaveCount(0);

        // It is still there once the money work scrolls, because the bar is pinned.
        await page.evaluate(() => window.scrollTo(0, 600));
        await expect(dayLabel).toBeInViewport();
    });

    test("Log Out is out of the bar and lives in the account sheet", async ({ page }) => {
        await login(page);

        // Nothing on the primary bar is word-labelled any more.
        await expect(page.getByRole("button", { name: "Log Out" })).toHaveCount(0);

        const trigger = page.getByRole("button", { name: /Open account menu/ });
        await trigger.click();

        const sheet = page.getByRole("menu", { name: "Account" });
        await expect(sheet).toBeVisible();
        // Who you are signed in as, and the sign-out that belongs with it.
        await expect(sheet.getByText("Admin").first()).toBeVisible();
        await expect(sheet.getByRole("menuitem", { name: /Log Out/ })).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu", { name: "Account" })).toHaveCount(0);
    });

    for (const viewport of SUPPORTED_PHONE_VIEWPORTS) {
        test(`the floor chrome does not crop or overflow at ${viewport.width}px`, async ({ page }) => {
            const date = "2026-05-24"; // not today: the bar carries a wider warning-state date shell
            await page.setViewportSize(viewport);
            await login(page);
            await setShiftDate(page, date);
            await openEditor(page);

            await expectNoHorizontalOverflow(page, viewport.width);

            const chrome = await page.evaluate(() => {
                const viewportWidth = document.documentElement.clientWidth;
                const rectFor = (el) => {
                    const rect = el.getBoundingClientRect();
                    return {
                        left: Math.round(rect.left),
                        right: Math.round(rect.right),
                        width: Math.round(rect.width),
                    };
                };
                const appBar = document.querySelector("header.sticky");
                const dayChips = [...document.querySelectorAll('[aria-label="Select a day this week"] button')];
                const dayRail = document.querySelector('[aria-label="Day steps"]');
                const railButtons = [...dayRail.querySelectorAll("button")];
                // The rail leads with the editor's Back chevron (DayRail.jsx), which is
                // an icon-only control - the step trail this asserts on starts after it.
                const stepButtons = railButtons.filter(
                    (button) => button.getAttribute("aria-label") !== "Back",
                );
                return {
                    viewportWidth,
                    appBar: rectFor(appBar),
                    appBarOverflows: appBar.scrollWidth > appBar.clientWidth + 1,
                    firstDayChip: rectFor(dayChips[0]),
                    lastDayChip: rectFor(dayChips[dayChips.length - 1]),
                    dayRail: rectFor(dayRail),
                    firstRailButton: rectFor(railButtons[0]),
                    firstStepButton: {
                        ...rectFor(stepButtons[0]),
                        text: stepButtons[0].innerText,
                    },
                    controls: [...appBar.querySelectorAll("button")].map((button) => ({
                        label: button.getAttribute("aria-label"),
                        width: Math.round(button.getBoundingClientRect().width),
                        height: Math.round(button.getBoundingClientRect().height),
                    })),
                };
            });

            expect(chrome.appBar.right).toBe(viewport.width);
            expect(chrome.appBarOverflows).toBe(false);
            expect(chrome.firstDayChip.left).toBeGreaterThanOrEqual(0);
            expect(chrome.lastDayChip.right).toBeLessThanOrEqual(viewport.width);
            expect(chrome.dayRail.left).toBeGreaterThanOrEqual(0);
            expect(chrome.dayRail.right).toBeLessThanOrEqual(viewport.width);
            expect(chrome.firstRailButton.left).toBeGreaterThanOrEqual(0);
            expect(chrome.firstStepButton.left).toBeGreaterThanOrEqual(0);
            expect(chrome.firstStepButton.text).toBe("Floor plan");

            const stepControl = /^(Previous|Next) (day|week)$/;
            const dateControl = /^Shift date:/;
            for (const control of chrome.controls) {
                if (stepControl.test(control.label || "") || dateControl.test(control.label || "")) {
                    expect(control.height, `${control.label} height`).toBe(36);
                } else {
                    expect(control.width, `${control.label} width`).toBeGreaterThanOrEqual(44);
                    expect(control.height, `${control.label} height`).toBeGreaterThanOrEqual(44);
                }
            }
        });
    }
});
