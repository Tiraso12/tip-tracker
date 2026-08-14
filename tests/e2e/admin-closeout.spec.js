import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

// The night itself, driven through the real UI: Floor plan -> Settle up -> Review,
// the money Review shows and what it refuses to show while something is missing,
// the payout ledger a save writes, and correcting or removing a day afterwards.
// The mobile blocks below are part of the same job rather than decoration - the
// floor is built and settled on a phone at 390px, so the in-place editor, the
// leave guard on a half-finished edit, and the 320px bar are money-losing paths
// when they break, not cosmetics.

const PROJECT_ID = "demo-tip-tracker-test";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "Password123!";
const SHIFT_DATE = "2026-05-29";
const MOBILE_VIEWPORT = { width: 390, height: 844 };

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
// its fields are disabled); the floating Edit unlocks the same fields in place and Done
// saves and re-locks. Review is then reached from the day rail like any other step -
// there is no Calculate button, because Review derives from the live inputs.
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

    // The rail walks to Review; the numbers are already derived from what was typed.
    await rail.getByRole("button", { name: "Review" }).click();
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

    await page.getByRole("button", { name: /Team 1/i }).click();
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    await page.getByRole("button", { name: "✓ Done" }).click();
    await expect(page.getByText("Floor plan is set")).toBeVisible();

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
    await page.getByRole("button", { name: /Team 1/i }).click();
    await assignFromPool(page, "Back One");

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

    await page.getByRole("button", { name: /Team 1/i }).click();
    await assignFromPool(page, "Captain One");

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

    await page.getByRole("button", { name: /Team 1/i }).click();
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    // Back One as the runner: this spec seeds only Admin / Captain One / Server One /
    // Back One, so there is no dedicated runner account to reach for here.
    //
    // Match "+ Add" too. The floor plan also has a role-FILTER tab bar (Captains /
    // Servers / ... / Runners / Temp) whose "Runners" tab is a button with the same
    // bare name; hitting that filters the pool to role=runner - empty in this seed -
    // instead of selecting the group to assign into.
    await page.getByRole("button", { name: /Runners \+ Add/i }).click();
    await assignFromPool(page, "Back One");
    await page.getByRole("button", { name: "✓ Done" }).click();
    await expect(page.getByText("Floor plan is set")).toBeVisible();

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
    await page.getByRole("button", { name: /Team 1/i }).click();
    await assignFromPool(page, "Captain One");
    await assignFromPool(page, "Server One");
    await assignFromPool(page, "Back One");

    // ✓ Done saves the floor and returns to the read-only floor view.
    await page.getByRole("button", { name: "✓ Done" }).click();
    await expect(page.getByText("Floor plan is set")).toBeVisible();

    // Settle up mirrors the floor plan: open its read-only summary, edit the money in
    // place, save with Done, then walk the rail to Review.
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
    // shift; roster edits go through Review -> Confirm & Save.
    await expect(page.getByRole("button", { name: "Save Team Setup" })).toHaveCount(0);

    // Closed shift: Settle up lands locked; the rail reaches the overwrite-confirmed
    // Review without unlocking anything.
    await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Settle" }).click();
    await page.getByRole("navigation", { name: "Day steps" }).getByRole("button", { name: "Review" }).click();
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

// Orphaned payout ledger entries: `payouts/{date}/entries/*` with no shifts/{date}
// doc behind them. Only `migrate:payout-ledger` (which writes ledger entries and
// never shift docs) and unfinished writes leave this shape - the app's own settle
// path always writes both. It is real payroll data the employee can see, and it
// used to be unreachable in the admin UI: with no shift doc the day read as blank.
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
        await expect(page.locator("#admin-workspace-nav")).toBeHidden();
        await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();

        // Team is still two taps away - through the account sheet, not a menu band.
        await page.getByRole("button", { name: /Open account menu/ }).click();
        await page.getByRole("menuitem", { name: "Team" }).click();
        await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();

        // ...and the app bar's home control is the way back out of it.
        await page.getByRole("button", { name: "Go to today's shifts" }).click();
        await expect(page.getByRole("navigation", { name: "Day steps" })).toBeVisible();
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
        await expect(page.getByText("Editing floor plan")).toBeVisible();

        // Add a member so there is uncommitted work that leaving would drop.
        await page.getByRole("button", { name: /Team 1/i }).click();
        const sheet = page.getByRole("dialog", { name: /Add employees to Team 1/i });
        await expect(sheet).toBeVisible();
        await sheet.locator('[title="Assign Back One to selected team"]').click();
        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Home, dismissed: the edit survives and the editor stays open.
        await page.getByRole("button", { name: "Go to today's shifts" }).click();
        await expect(page.getByText("Editing floor plan")).toBeVisible();
        expect(dialogs).toBe(1);

        // Account sheet -> Team, dismissed: same guard, same outcome. This is the
        // only nav that exits the editor on a phone now that the workspace menu is
        // gone, so it is the path that has to keep clearing the guard.
        await page.getByRole("button", { name: /Open account menu/ }).click();
        await page.getByRole("menuitem", { name: "Team" }).click();
        await expect(page.getByText("Editing floor plan")).toBeVisible();
        expect(dialogs).toBe(2);

        // Home, confirmed: the edit is discarded and home lands on TODAY's shifts,
        // not the closed day that was being edited.
        answer = "accept";
        await page.getByRole("button", { name: "Go to today's shifts" }).click();
        await expect(page.getByText("Editing floor plan")).toHaveCount(0);
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

// The app bar at the narrowest phone width the app supports. Log Out used to take
// 17.7% of a 390px bar for a once-a-shift action and, on the money screen, was the
// only word-labelled control on screen; the day being edited was not rendered at
// all on a phone while desktop showed it.
test.describe("app bar at 320px", () => {
    test.use({ viewport: { width: 320, height: 568 } });

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
        // a half-entered shift.
        await expect(page.locator('input[type="date"]')).toHaveCount(0);

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

    test("every app-bar control clears the 44px target guideline, and the bar does not overflow", async ({ page }) => {
        const date = "2026-05-24"; // not today: the bar carries its widest date label
        await login(page);
        await setShiftDate(page, date);

        const bar = await page.evaluate(() => {
            const el = document.querySelector("header.sticky");
            return {
                controls: [...el.querySelectorAll("button")].map((b) => ({
                    label: b.getAttribute("aria-label"),
                    w: b.getBoundingClientRect().width,
                    h: b.getBoundingClientRect().height,
                })),
                barOverflows: el.scrollWidth > el.clientWidth + 1,
                docOverflows: document.documentElement.scrollWidth > window.innerWidth + 1,
            };
        });

        expect(bar.controls.length).toBeGreaterThanOrEqual(3);
        for (const control of bar.controls) {
            expect(control.w, `${control.label} width`).toBeGreaterThanOrEqual(44);
            expect(control.h, `${control.label} height`).toBeGreaterThanOrEqual(44);
        }
        expect(bar.barOverflows).toBe(false);
        expect(bar.docOverflows).toBe(false);
    });
});
