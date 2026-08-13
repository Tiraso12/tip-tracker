// What the rules grant TODAY, with no manager named.
//
// The tier model in firestore.rules is dormant until restaurant/config exists,
// so this suite runs with no such document and pins the pre-tier behaviour
// exactly: the legacy `role: "admin"` account is still the only authority, a
// captain profile still grants nothing, and nobody has gained anything. It is
// the proof that shipping the tier definitions is behaviour-neutral.
//
// Its counterpart, manager-tier.test.js, seeds the pointer and proves the tiers.

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

import {
    CLOSED_DATE,
    OPEN_DATE,
    supervisorDoc,
    userDoc,
    validAuditEvent,
    validLegacyTip,
    validPayoutEntry,
    validPayoutMeta,
    validShift,
    validTempStaff,
} from "./fixtures.js";

// Its own project id: node --test runs suite files in parallel against one
// emulator, and clearFirestore() is per project - sharing an id would let the
// suites wipe each other's fixtures mid-run.
const PROJECT_ID = "demo-tip-tracker-current-state";
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
        // Deliberately NO restaurant/config document - the restaurant has not
        // named a manager yet, which is the state this release ships in.
        await setDoc(doc(db, "users/adminUid"), userDoc("adminUid", "admin", "active", "Admin"));
        await setDoc(doc(db, "users/captainUid"), userDoc("captainUid", "captain", "active", "Captain One"));
        // Someone already carrying the Supervisor switch. It is dormant with the
        // rest of the tier until a manager is named.
        await setDoc(doc(db, "users/supervisorUid"), supervisorDoc("supervisorUid", "captain", "active", "Captain Supervisor"));
        await setDoc(doc(db, "users/serverUid"), userDoc("serverUid", "server", "active", "Server One"));
        await setDoc(doc(db, "users/otherServerUid"), userDoc("otherServerUid", "server", "active", "Server Two"));
        await setDoc(doc(db, "users/pendingUid"), userDoc("pendingUid", "unassigned", "pending", "New Hire"));

        await setDoc(doc(db, "shifts/" + CLOSED_DATE), validShift(CLOSED_DATE));
        await setDoc(doc(db, "payouts/" + CLOSED_DATE), validPayoutMeta(CLOSED_DATE));
        await setDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`), validPayoutEntry(CLOSED_DATE, "serverUid"));
        await setDoc(doc(db, `payouts/${CLOSED_DATE}/entries/captainUid`), validPayoutEntry(CLOSED_DATE, "captainUid"));
        await setDoc(doc(db, `users/serverUid/tips/${CLOSED_DATE}`), validLegacyTip({ shiftDate: CLOSED_DATE }));
        await setDoc(doc(db, "unregisteredStaff/tempOne"), validTempStaff("tempOne"));
        await setDoc(doc(db, "auditEvents/seededOperation"), validAuditEvent({ operationId: "seededOperation" }));
        await setDoc(doc(db, "usernames/server one"), {
            uid: "serverUid",
            username: "Server One",
            email: "server@example.com",
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

test("CURRENT: a captain profile grants nothing beyond their own profile and their own pay", async () => {
    const db = authedDb("captainUid");

    await assertSucceeds(getDoc(doc(db, "users/captainUid")));
    await assertSucceeds(getDoc(doc(db, `payouts/${CLOSED_DATE}/entries/captainUid`)));

    await assertFails(getDocs(collection(db, "users")));
    await assertFails(getDoc(doc(db, "users/serverUid")));
    await assertFails(getDoc(doc(db, `users/serverUid/tips/${CLOSED_DATE}`)));
    await assertFails(getDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertFails(getDocs(collection(db, `payouts/${CLOSED_DATE}/entries`)));
    await assertFails(getDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertFails(getDocs(collection(db, "unregisteredStaff")));
    await assertFails(getDocs(collection(db, "auditEvents")));

    await assertFails(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift()));
    await assertFails(setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await assertFails(setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { role: "captain" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true }));
    await assertFails(setDoc(doc(db, "auditEvents/captainOperation"), validAuditEvent({ operationId: "captainOperation" })));
});

// The tier is dormant without a manager pointer, and the Supervisor switch is
// dormant with it: turning it on ahead of the cutover hands out nothing. That is
// what lets the switch be modelled and enforced in its own release.
test("CURRENT: the Supervisor switch grants nothing while no manager is named", async () => {
    const db = authedDb("supervisorUid");

    await assertSucceeds(getDoc(doc(db, "users/supervisorUid")));

    await assertFails(getDocs(collection(db, "users")));
    await assertFails(getDoc(doc(db, "users/serverUid")));
    await assertFails(getDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertFails(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift()));
    await assertFails(setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await assertFails(setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertFails(getDocs(collection(db, "auditEvents")));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true }));

    // Nor can they hand the switch to anyone, themselves included.
    await assertFails(updateDoc(doc(db, "users/serverUid"), { isSupervisor: true }));
    await assertFails(updateDoc(doc(db, "users/supervisorUid"), { isSupervisor: false }));

    // Only the legacy admin can move it today, and never onto themselves.
    const admin = authedDb("adminUid");
    await assertSucceeds(updateDoc(doc(admin, "users/serverUid"), { isSupervisor: true }));
    await assertFails(updateDoc(doc(admin, "users/adminUid"), { isSupervisor: true }));

    // ...and the person just switched on still holds nothing, because the tier
    // itself is dormant.
    await assertFails(getDocs(collection(authedDb("serverUid"), "users")));
});

test("CURRENT: the admin holds every authority, and the manager pointer does not exist yet", async () => {
    const db = authedDb("adminUid");

    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(getDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertSucceeds(getDocs(collection(db, `payouts/${CLOSED_DATE}/entries`)));
    await assertSucceeds(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift()));
    await assertSucceeds(setDoc(doc(db, "payouts/" + OPEN_DATE), validPayoutMeta()));
    await assertSucceeds(setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await assertSucceeds(deleteDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`)));
    await assertSucceeds(updateDoc(doc(db, "users/pendingUid"), { status: "active", role: "server" }));
    await assertSucceeds(setDoc(doc(db, `users/serverUid/tips/${OPEN_DATE}`), validLegacyTip()));
    await assertSucceeds(setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertSucceeds(deleteDoc(doc(db, "unregisteredStaff/tempTwo")));
    await assertSucceeds(setDoc(doc(db, "auditEvents/adminMerge"), validAuditEvent({
        operationId: "adminMerge",
        type: "temp_staff_merged",
    })));
    await assertSucceeds(deleteDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertSucceeds(deleteDoc(doc(db, "payouts/" + CLOSED_DATE)));

    // Gap (b) from the survey: an admin can still mint and remove admin peers.
    await assertSucceeds(updateDoc(doc(db, "users/serverUid"), { role: "admin" }));
    const promoted = await getDoc(doc(db, "users/serverUid"));
    assert.equal(promoted.data().role, "admin");
    await assertSucceeds(deleteDoc(doc(db, "users/otherServerUid")));

    // The cutover is a separate release and is done out of band, exactly the way
    // today's admin account was created. No client may mint the pointer.
    await assertFails(setDoc(doc(db, "restaurant/config"), { managerUid: "adminUid" }));
});

test("CURRENT: usernames stay world-readable and enumerable while profiles stay private", async () => {
    const db = guestDb();

    await assertSucceeds(getDoc(doc(db, "usernames/server one")));
    await assertSucceeds(getDocs(collection(db, "usernames")));

    await assertFails(getDoc(doc(db, "users/serverUid")));
    await assertFails(getDoc(doc(db, `users/serverUid/tips/${CLOSED_DATE}`)));
    await assertFails(getDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertFails(getDoc(doc(db, "restaurant/config")));
});

test("CURRENT: get and list stay separate - an employee reads their own entry but cannot scan the night", async () => {
    const db = authedDb("serverUid");

    await assertSucceeds(getDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(getDoc(doc(db, `users/serverUid/tips/${CLOSED_DATE}`)));
    await assertSucceeds(getDoc(doc(db, "users/serverUid")));

    await assertFails(getDocs(collection(db, `payouts/${CLOSED_DATE}/entries`)));
    await assertFails(getDoc(doc(db, `payouts/${CLOSED_DATE}/entries/captainUid`)));
    await assertFails(getDocs(collection(db, "users")));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { role: "captain" }));
});
