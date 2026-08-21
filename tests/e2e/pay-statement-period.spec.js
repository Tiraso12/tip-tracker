import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import {
    formatMonthDay,
    formatMonthDayRange,
    getBiweeklyPeriod,
    getCurrentWeek,
    toDateKey,
} from "../../src/utils/dateUtils.js";

// My Pay's paycheck line follows the WEEK ON SCREEN, not the calendar.
//
// The period a person is standing in has not closed yet, and the statement used
// to read that as "no paycheck here" and quietly fall back to the previous,
// already-paid period. So an employee opening their own pay mid-period saw the
// last cheque's dates and the last cheque's totals sitting under this week's
// days - two different fortnights on one screen, with nothing saying so. This
// suite pins the live screen to the open period the viewed week belongs to.

const PROJECT_ID = "demo-tip-tracker-test";
const PASSWORD = "Password123!";
const EMAIL = "pay-period@example.com";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

// The week My Pay opens on, and the two fortnights it sits between: the open
// one that contains it, and the closed one before it that the bug reached for.
const WEEK = getCurrentWeek(new Date());
const OPEN_PERIOD = getBiweeklyPeriod(WEEK[0]);
const PAID_PERIOD = getBiweeklyPeriod(new Date(OPEN_PERIOD.start.getTime() - 24 * 60 * 60 * 1000));

// Money on both sides of the boundary, told apart by size alone: if the
// statement ever snaps back a fortnight, the paycheck total jumps to $900.
const OPEN_PERIOD_DAY = toDateKey(OPEN_PERIOD.start);
const PAID_PERIOD_DAY = toDateKey(PAID_PERIOD.end);

let testEnv;
let uid;

async function createAuthUser() {
    const response = await fetch(
        `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: EMAIL, password: PASSWORD, displayName: "Server One", returnSecureToken: true }),
        }
    );
    if (!response.ok) throw new Error(`Failed to create auth user: ${await response.text()}`);
    return response.json();
}

async function seedLedgerEntry(db, dateKey, { tips, gratuity, cash }) {
    await setDoc(doc(db, "payouts", dateKey), { date: dateKey, ledgerVersion: 1 });
    await setDoc(doc(db, "payouts", dateKey, "entries", uid), {
        date: dateKey,
        uid,
        name: "Server One",
        role: "server",
        points: 4,
        tips,
        gratuity,
        cash,
        total: tips + gratuity,
        ledgerVersion: 1,
        source: "closeout",
    });
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
    await testEnv.clearFirestore();
    await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });

    uid = (await createAuthUser()).localId;

    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, `users/${uid}`), {
            uid,
            username: "Server One",
            firstName: "Server",
            lastName: "One",
            email: EMAIL,
            role: "server",
            status: "active",
        });
        await seedLedgerEntry(db, PAID_PERIOD_DAY, { tips: 800, gratuity: 100, cash: 60 });
        await seedLedgerEntry(db, OPEN_PERIOD_DAY, { tips: 120, gratuity: 30, cash: 15 });
    });
});

test("My Pay's paycheck line names the open period the viewed week is in", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByLabel("Username or Email").fill(EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();

    const statement = page.getByTestId("pay-statement");
    await expect(statement).toBeVisible();

    // The open period the viewed week belongs to - named on screen, with its
    // advice date a week past its close.
    await expect(statement).toContainText(
        `Pay period ${formatMonthDayRange(OPEN_PERIOD.start, OPEN_PERIOD.end)}`
    );
    await expect(statement).toContainText(
        `lands on your ${formatMonthDay(new Date(OPEN_PERIOD.end.getTime() + 7 * 24 * 60 * 60 * 1000))} paycheck`
    );

    // ...and never the fortnight already paid out.
    await expect(statement).not.toContainText(
        `Pay period ${formatMonthDayRange(PAID_PERIOD.start, PAID_PERIOD.end)}`
    );

    // The totals come from the same period the line names: this fortnight's
    // $120 + $30, not the closed one's $800 + $100.
    const totals = statement.getByLabel("Paycheck totals");
    await expect(totals).toContainText("$120.00");
    await expect(totals).toContainText("$30.00");
    await expect(totals).toContainText("$150.00");
    await expect(totals).not.toContainText("$900.00");

    // A picture of the screen this test is about, kept with the run: the
    // paycheck line and the totals under it are what a reader needs to see.
    const shot = testInfo.outputPath("my-pay-open-period.png");
    await page.screenshot({ path: shot, fullPage: true });
    await testInfo.attach("my-pay-open-period", { path: shot, contentType: "image/png" });
});
