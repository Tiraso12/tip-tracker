import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
} from "firebase/firestore";

const PROJECT_ID = "demo-tip-tracker-test";
const rules = readFileSync("firestore.rules", "utf8");

let testEnv;

test.before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules },
    });
});

test.beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "users/adminUid"), {
            uid: "adminUid",
            username: "Admin",
            firstName: "Admin",
            lastName: "",
            role: "admin",
            status: "active",
        });
        await setDoc(doc(db, "users/inactiveAdminUid"), {
            uid: "inactiveAdminUid",
            username: "Inactive Admin",
            firstName: "Inactive Admin",
            lastName: "",
            role: "admin",
            status: "inactive",
        });
        await setDoc(doc(db, "users/employeeUid"), {
            uid: "employeeUid",
            username: "Employee",
            firstName: "Employee",
            lastName: "",
            role: "server",
            status: "active",
        });
        await setDoc(doc(db, "users/otherEmployeeUid"), {
            uid: "otherEmployeeUid",
            username: "Other Employee",
            firstName: "Other Employee",
            lastName: "",
            role: "server",
            status: "active",
        });
        await setDoc(doc(db, "payouts/2026-05-29"), {
            date: "2026-05-29",
            ledgerVersion: 1,
        });
        await setDoc(doc(db, "payouts/2026-05-29/entries/employeeUid"), {
            uid: "employeeUid",
            date: "2026-05-29",
            tips: 100,
            gratuity: 25,
            cash: 10,
            total: 135,
        });
        await setDoc(doc(db, "shifts/2026-05-29"), {
            date: "2026-05-29",
            status: "closed",
        });
        await setDoc(doc(db, "usernames/employee"), {
            uid: "employeeUid",
            username: "Employee",
            email: "employee@example.com",
        });
    });
});

test.after(async () => {
    await testEnv.cleanup();
});

function authedDb(uid) {
    return testEnv.authenticatedContext(uid).firestore();
}

function guestDb() {
    return testEnv.unauthenticatedContext().firestore();
}

function validShift(date = "2026-05-30", overrides = {}) {
    return {
        date,
        status: "closed",
        teams: [],
        barTeam: { members: [], pools: {} },
        runners: [],
        summary: {
            balances: {
                totalAvailable: 0,
                totalDistributed: 0,
                overallBalance: 0,
            },
        },
        firstClosedAt: "2026-05-30T02:00:00.000Z",
        closedAt: "2026-05-30T02:00:00.000Z",
        lastRecalculatedAt: "2026-05-30T02:00:00.000Z",
        updatedAt: "2026-05-30T02:00:00.000Z",
        updatedBy: "adminUid",
        operationId: "operation-one",
        ...overrides,
    };
}

function validPayoutEntry(date = "2026-05-30", uid = "employeeUid", overrides = {}) {
    return {
        ledgerVersion: 1,
        date,
        uid,
        name: "Employee",
        role: "server",
        points: 2,
        tips: 100,
        gratuity: 50,
        cash: 20,
        wineBonus: 0,
        total: 150,
        teamId: "team-1",
        breakdown: {},
        payoutAmount: null,
        operationId: "operation-one",
        updatedAt: "2026-05-30T02:00:00.000Z",
        updatedBy: "adminUid",
        source: "closeout",
        ...overrides,
    };
}

function validLegacyTip(overrides = {}) {
    return {
        gratuity: 50,
        tip: 100,
        cash: 20,
        wineBonus: 0,
        points: 2,
        total: 150,
        role: "server",
        shiftDate: "2026-05-30",
        updatedAt: "2026-05-30T02:00:00.000Z",
        ...overrides,
    };
}

function validTempStaff(uid = "tempOne", overrides = {}) {
    return {
        uid,
        name: "Temp One",
        username: "Temp One",
        role: "server",
        status: "active",
        isUnregistered: true,
        createdAt: "2026-05-30T02:00:00.000Z",
        ...overrides,
    };
}

function validAuditEvent(overrides = {}) {
    return {
        type: "shift_closed",
        operationId: "operationOne",
        createdAt: "2026-05-30T02:00:00.000Z",
        ledgerVersion: 1,
        date: "2026-05-30",
        shiftId: "2026-05-30",
        actorUid: "adminUid",
        previousPayoutUids: [],
        nextPayoutUids: ["employeeUid"],
        removedPayoutUids: [],
        previousPayoutCount: 0,
        nextPayoutCount: 1,
        ...overrides,
    };
}

test("public username lookup is readable, but private user data is not readable when logged out", async () => {
    const db = guestDb();

    await assertSucceeds(getDoc(doc(db, "usernames/employee")));
    await assertFails(getDoc(doc(db, "users/employeeUid")));
    await assertFails(getDoc(doc(db, "users/employeeUid/tips/2026-05-29")));
    await assertFails(getDoc(doc(db, "payouts/2026-05-29/entries/employeeUid")));
});

test("an employee can read their own profile and payout ledger entries only", async () => {
    const db = authedDb("employeeUid");

    await assertSucceeds(getDoc(doc(db, "users/employeeUid")));
    await assertSucceeds(getDoc(doc(db, "users/employeeUid/tips/2026-05-29")));
    await assertSucceeds(getDoc(doc(db, "payouts/2026-05-29/entries/employeeUid")));
    await assertSucceeds(getDoc(doc(db, "payouts/2026-05-30/entries/employeeUid")));
    await assertFails(getDoc(doc(db, "users/otherEmployeeUid")));
    await assertFails(getDoc(doc(db, "users/otherEmployeeUid/tips/2026-05-29")));
    await assertFails(getDoc(doc(db, "payouts/2026-05-29/entries/otherEmployeeUid")));
    await assertFails(getDocs(collection(db, "payouts/2026-05-29/entries")));
});

test("an employee cannot write payouts, shifts, temporary staff, or self-update role data", async () => {
    const db = authedDb("employeeUid");

    await assertFails(setDoc(doc(db, "users/employeeUid/tips/2026-05-30"), { total: 999 }));
    await assertFails(setDoc(doc(db, "payouts/2026-05-30/entries/employeeUid"), { total: 999 }));
    await assertFails(setDoc(doc(db, "shifts/2026-05-30"), validShift()));
    await assertFails(setDoc(doc(db, "unregisteredStaff/tempOne"), validTempStaff()));
    await assertFails(updateDoc(doc(db, "users/employeeUid"), { role: "admin" }));
});

test("new users can only create their own pending unassigned profile", async () => {
    const db = authedDb("newUserUid");

    await assertSucceeds(setDoc(doc(db, "users/newUserUid"), {
        uid: "newUserUid",
        username: "New User",
        firstName: "New User",
        lastName: "",
        email: "new@example.com",
        role: "unassigned",
        status: "pending",
    }));

    await testEnv.clearFirestore();

    await assertFails(setDoc(doc(db, "users/newUserUid"), {
        uid: "newUserUid",
        username: "New User",
        firstName: "New User",
        lastName: "",
        email: "new@example.com",
        role: "admin",
        status: "active",
    }));

    await assertFails(setDoc(doc(db, "users/newUserUid"), {
        uid: "newUserUid",
        username: "New User",
        firstName: "New User",
        lastName: "",
        email: "new@example.com",
        role: "unassigned",
        status: "pending",
        hasShiftHistory: true,
    }));

    await assertFails(setDoc(doc(db, "users/someoneElseUid"), {
        uid: "someoneElseUid",
        username: "Someone Else",
        firstName: "Someone Else",
        lastName: "",
        role: "unassigned",
        status: "pending",
    }));
});

test("username mappings can be created by their owner but not abused or overwritten", async () => {
    const db = authedDb("newUserUid");

    await assertSucceeds(setDoc(doc(db, "usernames/newuser"), {
        uid: "newUserUid",
        username: "New User",
        email: "new@example.com",
    }));

    await assertFails(setDoc(doc(db, "usernames/employee"), {
        uid: "newUserUid",
        username: "Employee",
        email: "different@example.com",
    }));

    await assertFails(setDoc(doc(db, "usernames/otheruser"), {
        uid: "otherEmployeeUid",
        username: "Other User",
        email: "other@example.com",
    }));

    await assertFails(setDoc(doc(db, "usernames/withrole"), {
        uid: "newUserUid",
        username: "With Role",
        email: "withrole@example.com",
        role: "admin",
    }));

    await assertFails(setDoc(doc(guestDb(), "usernames/guest"), {
        uid: "guestUid",
        username: "Guest",
        email: "guest@example.com",
    }));
});

test("admin access requires an active admin profile", async () => {
    const inactiveAdminDb = authedDb("inactiveAdminUid");

    await assertFails(getDoc(doc(inactiveAdminDb, "users/employeeUid")));
    await assertFails(updateDoc(doc(inactiveAdminDb, "users/employeeUid"), { status: "inactive" }));
    await assertFails(setDoc(doc(inactiveAdminDb, "shifts/2026-05-30"), validShift()));
    await assertFails(setDoc(doc(inactiveAdminDb, "payouts/2026-05-30/entries/employeeUid"), validPayoutEntry()));
});

test("admin user writes must keep valid role and status enums", async () => {
    const db = authedDb("adminUid");

    await assertSucceeds(updateDoc(doc(db, "users/employeeUid"), { role: "captain" }));
    await assertSucceeds(updateDoc(doc(db, "users/employeeUid"), { status: "inactive" }));
    await assertFails(updateDoc(doc(db, "users/employeeUid"), { role: "owner" }));
    await assertFails(updateDoc(doc(db, "users/employeeUid"), { status: "disabled" }));
});

test("profile names are bounded, manager-writable, and never self-writable", async () => {
    const admin = authedDb("adminUid");
    const employee = authedDb("employeeUid");

    await assertSucceeds(updateDoc(doc(admin, "users/employeeUid"), {
        firstName: "Sonia",
        lastName: "Alvarez Garcia",
    }));
    await assertFails(updateDoc(doc(employee, "users/employeeUid"), { firstName: "Self rename" }));
    await assertFails(updateDoc(doc(admin, "users/employeeUid"), { firstName: "" }));
    await assertFails(updateDoc(doc(admin, "users/employeeUid"), { firstName: "x".repeat(81) }));
    await assertFails(updateDoc(doc(admin, "users/employeeUid"), { lastName: "x".repeat(81) }));
});

test("an admin can manage users, shifts, payout ledger entries, and temporary staff", async () => {
    const db = authedDb("adminUid");

    await assertSucceeds(getDoc(doc(db, "users/employeeUid")));
    await assertSucceeds(updateDoc(doc(db, "users/employeeUid"), { status: "inactive" }));
    await assertSucceeds(setDoc(doc(db, "shifts/2026-05-30"), validShift()));
    await assertSucceeds(setDoc(doc(db, "users/employeeUid/tips/2026-05-30"), validLegacyTip()));
    await assertSucceeds(setDoc(doc(db, "payouts/2026-05-30"), { date: "2026-05-30", ledgerVersion: 1 }));
    await assertSucceeds(setDoc(doc(db, "payouts/2026-05-30/entries/employeeUid"), validPayoutEntry()));
    await assertSucceeds(setDoc(doc(db, "unregisteredStaff/tempOne"), validTempStaff()));
    await assertSucceeds(deleteDoc(doc(db, "unregisteredStaff/tempOne")));

    const payoutDoc = await getDoc(doc(db, "payouts/2026-05-30/entries/employeeUid"));
    assert.equal(payoutDoc.data().total, 150);
});

test("admin money writes must match validated shapes and document ids", async () => {
    const db = authedDb("adminUid");

    await assertFails(setDoc(doc(db, "shifts/2026-05-30"), validShift("2026-05-31")));
    await assertFails(setDoc(doc(db, "shifts/2026-05-30"), validShift("2026-05-30", { status: "paid" })));
    await assertFails(setDoc(doc(db, "shifts/2026-05-30"), {
        date: "2026-05-30",
        status: "closed",
        payouts: {},
    }));

    await assertFails(setDoc(doc(db, "payouts/2026-05-30"), { date: "2026-05-31", ledgerVersion: 1 }));
    await assertFails(setDoc(doc(db, "payouts/2026-05-30"), { date: "2026-05-30", ledgerVersion: 2 }));
    await assertFails(setDoc(doc(db, "payouts/2026-05-30/entries/employeeUid"), validPayoutEntry("2026-05-31")));
    await assertFails(setDoc(doc(db, "payouts/2026-05-30/entries/employeeUid"), validPayoutEntry("2026-05-30", "otherEmployeeUid")));
    await assertFails(setDoc(doc(db, "payouts/2026-05-30/entries/employeeUid"), validPayoutEntry("2026-05-30", "employeeUid", { role: "owner" })));

    await assertFails(setDoc(doc(db, "users/employeeUid/tips/2026-05-30"), validLegacyTip({ role: "owner" })));
    await assertFails(setDoc(doc(db, "users/employeeUid/tips/2026-05-30"), validLegacyTip({ shiftDate: "2026-05-31" })));
    await assertFails(setDoc(doc(db, "unregisteredStaff/tempOne"), validTempStaff("otherTemp")));
    await assertFails(setDoc(doc(db, "unregisteredStaff/tempOne"), validTempStaff("tempOne", { status: "pending" })));
});

test("admin audit events are create-only", async () => {
    const db = authedDb("adminUid");
    const auditRef = doc(db, "auditEvents/operationOne");

    await assertSucceeds(setDoc(auditRef, validAuditEvent()));

    await assertFails(updateDoc(auditRef, { type: "shift_recalculated" }));
    await assertFails(deleteDoc(auditRef));
    await assertFails(setDoc(doc(db, "auditEvents/badOperation"), validAuditEvent({ type: "admin_note" })));
});
