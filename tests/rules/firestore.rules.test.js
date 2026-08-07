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
            role: "admin",
            status: "active",
        });
        await setDoc(doc(db, "users/employeeUid"), {
            uid: "employeeUid",
            username: "Employee",
            role: "server",
            status: "active",
        });
        await setDoc(doc(db, "users/otherEmployeeUid"), {
            uid: "otherEmployeeUid",
            username: "Other Employee",
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
    await assertFails(setDoc(doc(db, "shifts/2026-05-30"), { status: "closed" }));
    await assertFails(setDoc(doc(db, "unregisteredStaff/tempOne"), { name: "Temp One" }));
    await assertFails(updateDoc(doc(db, "users/employeeUid"), { role: "admin" }));
});

test("new users can only create their own pending unassigned profile", async () => {
    const db = authedDb("newUserUid");

    await assertSucceeds(setDoc(doc(db, "users/newUserUid"), {
        uid: "newUserUid",
        username: "New User",
        email: "new@example.com",
        role: "unassigned",
        status: "pending",
    }));

    await testEnv.clearFirestore();

    await assertFails(setDoc(doc(db, "users/newUserUid"), {
        uid: "newUserUid",
        username: "New User",
        email: "new@example.com",
        role: "admin",
        status: "active",
    }));

    await assertFails(setDoc(doc(db, "users/someoneElseUid"), {
        uid: "someoneElseUid",
        username: "Someone Else",
        role: "unassigned",
        status: "pending",
    }));
});

test("username mappings can be created by their owner but not overwritten by a regular user", async () => {
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
});

test("an admin can manage users, shifts, payout ledger entries, and temporary staff", async () => {
    const db = authedDb("adminUid");

    await assertSucceeds(getDoc(doc(db, "users/employeeUid")));
    await assertSucceeds(updateDoc(doc(db, "users/employeeUid"), { status: "inactive" }));
    await assertSucceeds(setDoc(doc(db, "shifts/2026-05-30"), { date: "2026-05-30", status: "closed" }));
    await assertSucceeds(setDoc(doc(db, "users/employeeUid/tips/2026-05-30"), { total: 150 }));
    await assertSucceeds(setDoc(doc(db, "payouts/2026-05-30"), { date: "2026-05-30", ledgerVersion: 1 }));
    await assertSucceeds(setDoc(doc(db, "payouts/2026-05-30/entries/employeeUid"), {
        uid: "employeeUid",
        date: "2026-05-30",
        total: 150,
    }));
    await assertSucceeds(setDoc(doc(db, "unregisteredStaff/tempOne"), { name: "Temp One" }));
    await assertSucceeds(deleteDoc(doc(db, "unregisteredStaff/tempOne")));

    const payoutDoc = await getDoc(doc(db, "payouts/2026-05-30/entries/employeeUid"));
    assert.equal(payoutDoc.data().total, 150);
});

test("admin audit events are create-only", async () => {
    const db = authedDb("adminUid");
    const auditRef = doc(db, "auditEvents/operationOne");

    await assertSucceeds(setDoc(auditRef, {
        type: "shift_closed",
        operationId: "operationOne",
        date: "2026-05-30",
    }));

    await assertFails(updateDoc(auditRef, { type: "shift_recalculated" }));
    await assertFails(deleteDoc(auditRef));
});
