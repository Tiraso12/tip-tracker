// The three-tier model - Manager > Captain > Employee - once a manager exists.
//
// Everything here runs with restaurant/config seeded, which is what makes the
// tiers live. The manager's own users/{uid} document deliberately carries
// `role: "unassigned"`: the tier comes from the pointer and from nothing else,
// so a role value can neither grant it nor be confused for it.
//
// current-state.test.js is the counterpart - same rules file, no pointer, and
// today's behaviour unchanged.

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
    shiftWithWorkedRole,
    userDoc,
    validAuditEvent,
    validLegacyTip,
    validPayoutEntry,
    validPayoutMeta,
    validShift,
    validTempStaff,
} from "./fixtures.js";

// Its own project id - see the note in current-state.test.js.
const PROJECT_ID = "demo-tip-tracker-manager-tier";
const rules = readFileSync("firestore.rules", "utf8");
const CONFIG_PATH = "restaurant/config";

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
        await setDoc(doc(db, CONFIG_PATH), { managerUid: "managerUid" });

        // The manager's roster role is NOT what makes them the manager. They do
        // not work a section and are not paid from the pool, so they carry no
        // pay weight at all.
        await setDoc(doc(db, "users/managerUid"), userDoc("managerUid", "unassigned", "active", "Manager"));
        await setDoc(doc(db, "users/adminUid"), userDoc("adminUid", "admin", "active", "Admin"));
        await setDoc(doc(db, "users/captainUid"), userDoc("captainUid", "captain", "active", "Captain One"));
        await setDoc(doc(db, "users/serverUid"), userDoc("serverUid", "server", "active", "Server One"));
        await setDoc(doc(db, "users/otherServerUid"), userDoc("otherServerUid", "server", "active", "Server Two"));
        await setDoc(doc(db, "users/pendingUid"), userDoc("pendingUid", "unassigned", "pending", "New Hire"));
        await setDoc(doc(db, "users/inactiveUid"), userDoc("inactiveUid", "unassigned", "inactive", "Former Manager"));

        await setDoc(doc(db, "shifts/" + CLOSED_DATE), validShift(CLOSED_DATE));
        await setDoc(doc(db, "payouts/" + CLOSED_DATE), validPayoutMeta(CLOSED_DATE));
        await setDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`), validPayoutEntry(CLOSED_DATE, "serverUid"));
        await setDoc(doc(db, `payouts/${CLOSED_DATE}/entries/otherServerUid`), validPayoutEntry(CLOSED_DATE, "otherServerUid"));
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

async function repointManager(uid) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), CONFIG_PATH), { managerUid: uid });
    });
}

async function setStatus(uid, status) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "users", uid), { status });
    });
}

// The writes saveClosedShiftAtomically makes when a settled day is corrected:
// the shift doc, the ledger meta, the surviving entries, the entries of anyone
// dropped from the floor plan, the participants' history flags, and one
// shift_recalculated audit event.
async function assertCorrectionPathAllowed(db, operationId) {
    await assertSucceeds(setDoc(doc(db, "shifts/" + CLOSED_DATE), validShift(CLOSED_DATE)));
    await assertSucceeds(setDoc(doc(db, "payouts/" + CLOSED_DATE), validPayoutMeta(CLOSED_DATE)));
    await assertSucceeds(setDoc(
        doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`),
        validPayoutEntry(CLOSED_DATE, "serverUid", { total: 175, tips: 125 }),
    ));
    await assertSucceeds(deleteDoc(doc(db, `payouts/${CLOSED_DATE}/entries/otherServerUid`)));
    await assertSucceeds(updateDoc(doc(db, "users/serverUid"), {
        hasShiftHistory: true,
        hasTipHistory: true,
    }));
    await assertSucceeds(setDoc(doc(db, "auditEvents/" + operationId), validAuditEvent({
        operationId,
        type: "shift_recalculated",
        date: CLOSED_DATE,
        shiftId: CLOSED_DATE,
    })));
}

test("PROPOSED: a captain can build a floor plan, settle money, and audit it", async () => {
    const db = authedDb("captainUid");

    // The floor plan pool needs the roster.
    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(getDoc(doc(db, "users/serverUid")));

    // Build the plan, add a temp profile mid-setup, then settle up.
    await assertSucceeds(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift(OPEN_DATE, { status: "setup" })));
    await assertSucceeds(setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertSucceeds(getDocs(collection(db, "unregisteredStaff")));
    await assertSucceeds(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift(OPEN_DATE)));
    await assertSucceeds(setDoc(doc(db, "payouts/" + OPEN_DATE), validPayoutMeta()));
    await assertSucceeds(setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await assertSucceeds(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true, hasTipHistory: true }));
    await assertSucceeds(setDoc(doc(db, "auditEvents/closeOperation"), validAuditEvent({ operationId: "closeOperation" })));

    // Review reads the whole night back.
    await assertSucceeds(getDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertSucceeds(getDocs(collection(db, `payouts/${CLOSED_DATE}/entries`)));
    await assertSucceeds(getDocs(collection(db, "payouts")));
    await assertSucceeds(getDocs(collection(db, "auditEvents")));
});

test("PROPOSED: a captain can read ANOTHER person's pay history, employees still cannot", async () => {
    const captain = authedDb("captainUid");
    await assertSucceeds(getDoc(doc(captain, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(getDocs(collection(captain, `payouts/${CLOSED_DATE}/entries`)));
    await assertSucceeds(getDoc(doc(captain, "users/serverUid")));
    await assertSucceeds(getDoc(doc(captain, `users/serverUid/tips/${CLOSED_DATE}`)));

    const server = authedDb("serverUid");
    await assertSucceeds(getDoc(doc(server, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(getDoc(doc(server, `users/serverUid/tips/${CLOSED_DATE}`)));
    await assertFails(getDoc(doc(server, `payouts/${CLOSED_DATE}/entries/captainUid`)));
    await assertFails(getDocs(collection(server, `payouts/${CLOSED_DATE}/entries`)));
    await assertFails(getDocs(collection(server, "users")));
    await assertFails(getDoc(doc(server, "users/captainUid")));
});

test("PROPOSED: a captain cannot approve accounts, assign roles, merge, or remove a day", async () => {
    const db = authedDb("captainUid");

    // Approvals and role assignment are the manager's.
    await assertFails(updateDoc(doc(db, "users/pendingUid"), { status: "active" }));
    await assertFails(updateDoc(doc(db, "users/pendingUid"), { status: "active", role: "server" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { role: "captain" }));
    await assertFails(updateDoc(doc(db, "users/captainUid"), { role: "admin" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { status: "inactive" }));
    await assertFails(deleteDoc(doc(db, "users/serverUid")));
    await assertFails(updateDoc(doc(db, "usernames/server one"), { uid: "captainUid" }));

    // Settle-up may stamp history flags and nothing else - no smuggled role change.
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true, role: "captain" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true, status: "inactive" }));

    // The merge, and its destructive half.
    await assertFails(deleteDoc(doc(db, "unregisteredStaff/tempOne")));
    await assertFails(setDoc(doc(db, `users/serverUid/tips/${OPEN_DATE}`), validLegacyTip()));
    await assertFails(setDoc(doc(db, "auditEvents/mergeOperation"), validAuditEvent({
        operationId: "mergeOperation",
        type: "temp_staff_merged",
    })));

    // Removing the settled day.
    await assertFails(deleteDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertFails(deleteDoc(doc(db, "payouts/" + CLOSED_DATE)));
    await assertFails(setDoc(doc(db, "auditEvents/removalOperation"), validAuditEvent({
        operationId: "removalOperation",
        type: "shift_removed",
    })));

    // And the tier itself.
    await assertFails(updateDoc(doc(db, CONFIG_PATH), { managerUid: "captainUid" }));
    await assertFails(setDoc(doc(db, CONFIG_PATH), { managerUid: "captainUid" }));
    await assertFails(deleteDoc(doc(db, CONFIG_PATH)));
});

test("PROPOSED: an employee has no captain power, and cannot self-promote", async () => {
    const db = authedDb("serverUid");

    await assertFails(getDocs(collection(db, "users")));
    await assertFails(getDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertFails(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift()));
    await assertFails(setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await assertFails(deleteDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertFails(setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertFails(getDocs(collection(db, "unregisteredStaff")));
    await assertFails(getDocs(collection(db, "auditEvents")));
    await assertFails(setDoc(doc(db, "auditEvents/serverOperation"), validAuditEvent({ operationId: "serverOperation" })));

    await assertFails(updateDoc(doc(db, "users/serverUid"), { role: "captain" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { role: "admin" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true }));
    await assertFails(updateDoc(doc(db, CONFIG_PATH), { managerUid: "serverUid" }));

    // Reading who the manager is stays open to any signed-in user - it is one uid,
    // and the client needs it to know whether it holds the tier.
    await assertSucceeds(getDoc(doc(db, CONFIG_PATH)));
});

test("PROPOSED: the manager holds every captain power plus the manager-only ones", async () => {
    const db = authedDb("managerUid");

    // Cumulative - every captain capability.
    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift()));
    await assertSucceeds(setDoc(doc(db, "payouts/" + OPEN_DATE), validPayoutMeta()));
    await assertSucceeds(setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await assertSucceeds(getDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertSucceeds(setDoc(doc(db, "auditEvents/closeOperation"), validAuditEvent({ operationId: "closeOperation" })));

    // Manager-only: approvals, roles, deactivation, deletion.
    await assertSucceeds(updateDoc(doc(db, "users/pendingUid"), { status: "active", role: "server" }));
    await assertSucceeds(updateDoc(doc(db, "users/serverUid"), { role: "captain" }));
    await assertSucceeds(updateDoc(doc(db, "users/serverUid"), { status: "inactive" }));
    await assertSucceeds(deleteDoc(doc(db, "users/otherServerUid")));
    await assertSucceeds(updateDoc(doc(db, "usernames/server one"), { uid: "serverUid", username: "Server One", email: "moved@example.com" }));

    // Manager-only: the merge and its destructive half.
    await assertSucceeds(setDoc(doc(db, `users/serverUid/tips/${OPEN_DATE}`), validLegacyTip()));
    await assertSucceeds(deleteDoc(doc(db, "unregisteredStaff/tempOne")));
    await assertSucceeds(setDoc(doc(db, "auditEvents/mergeOperation"), validAuditEvent({
        operationId: "mergeOperation",
        type: "temp_staff_merged",
    })));

    // Manager-only: removing a settled day, in full.
    await assertSucceeds(deleteDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(deleteDoc(doc(db, "payouts/" + CLOSED_DATE)));
    await assertSucceeds(deleteDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertSucceeds(setDoc(doc(db, "auditEvents/removalOperation"), validAuditEvent({
        operationId: "removalOperation",
        type: "shift_removed",
    })));
});

test("PROPOSED: exactly one manager is structural - promoting to captain grants no manager power", async () => {
    const manager = authedDb("managerUid");

    // The manager's own roster role grants nothing; the pointer is the tier.
    const managerProfile = await getDoc(doc(manager, "users/managerUid"));
    assert.equal(managerProfile.data().role, "unassigned");

    // Assigning the captain role hands over captain powers and nothing more.
    await assertSucceeds(updateDoc(doc(manager, "users/serverUid"), { role: "captain" }));
    const freshCaptain = authedDb("serverUid");
    await assertSucceeds(getDocs(collection(freshCaptain, "users")));
    await assertFails(updateDoc(doc(freshCaptain, "users/pendingUid"), { status: "active" }));
    await assertFails(updateDoc(doc(freshCaptain, CONFIG_PATH), { managerUid: "serverUid" }));

    // Transfer is one atomic write by the sitting manager. There is no moment
    // with zero or two managers: the pointer holds exactly one uid.
    await assertSucceeds(updateDoc(doc(manager, CONFIG_PATH), { managerUid: "captainUid" }));

    const incoming = authedDb("captainUid");
    await assertSucceeds(updateDoc(doc(incoming, "users/pendingUid"), { status: "active", role: "server" }));
    await assertSucceeds(deleteDoc(doc(incoming, "unregisteredStaff/tempOne")));

    const outgoing = authedDb("managerUid");
    await assertFails(updateDoc(doc(outgoing, "users/serverUid"), { role: "server" }));
    await assertFails(updateDoc(doc(outgoing, CONFIG_PATH), { managerUid: "managerUid" }));
    // ...and with role "unassigned" the outgoing manager keeps nothing at all.
    await assertFails(getDocs(collection(outgoing, "users")));
    await assertFails(setDoc(doc(outgoing, "shifts/" + OPEN_DATE), validShift()));
});

test("PROPOSED: an inactive manager has no power at all", async () => {
    await setStatus("managerUid", "inactive");
    const deactivated = authedDb("managerUid");

    await assertFails(getDocs(collection(deactivated, "users")));
    await assertFails(setDoc(doc(deactivated, "shifts/" + OPEN_DATE), validShift()));
    await assertFails(updateDoc(doc(deactivated, "users/pendingUid"), { status: "active" }));
    await assertFails(deleteDoc(doc(deactivated, "shifts/" + CLOSED_DATE)));
    await assertFails(updateDoc(doc(deactivated, CONFIG_PATH), { managerUid: "captainUid" }));

    // The same holds when the pointer names someone who is already inactive.
    await repointManager("inactiveUid");
    const inactive = authedDb("inactiveUid");
    await assertFails(getDocs(collection(inactive, "users")));
    await assertFails(updateDoc(doc(inactive, "users/pendingUid"), { status: "active" }));
    await assertFails(updateDoc(doc(inactive, CONFIG_PATH), { managerUid: "inactiveUid" }));

    // An inactive captain is equally powerless.
    await setStatus("captainUid", "inactive");
    const inactiveCaptain = authedDb("captainUid");
    await assertFails(getDocs(collection(inactiveCaptain, "users")));
    await assertFails(setDoc(doc(inactiveCaptain, "shifts/" + OPEN_DATE), validShift()));
});

test("PROPOSED: correcting a settled day is captain work; removing it is not, and the paths do not leak", async () => {
    const captain = authedDb("captainUid");

    // Every write in the correction batch is allowed...
    await assertCorrectionPathAllowed(captain, "captainRecalc");

    // ...and every write that is unique to the removal batch is not, so the
    // removal cannot commit even though the two share their entry deletes.
    await assertFails(deleteDoc(doc(captain, "shifts/" + CLOSED_DATE)));
    await assertFails(deleteDoc(doc(captain, "payouts/" + CLOSED_DATE)));
    await assertFails(setDoc(doc(captain, "auditEvents/removalByCaptain"), validAuditEvent({
        operationId: "removalByCaptain",
        type: "shift_removed",
    })));

    // The manager runs the same correction, then the removal it gates.
    const manager = authedDb("managerUid");
    await assertCorrectionPathAllowed(manager, "managerRecalc");
    await assertSucceeds(deleteDoc(doc(manager, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(deleteDoc(doc(manager, "payouts/" + CLOSED_DATE)));
    await assertSucceeds(deleteDoc(doc(manager, "shifts/" + CLOSED_DATE)));
    await assertSucceeds(setDoc(doc(manager, "auditEvents/removalByManager"), validAuditEvent({
        operationId: "removalByManager",
        type: "shift_removed",
    })));
});

test("PROPOSED: a floor plan's worked-as role is pay weight and grants nothing", async () => {
    const captain = authedDb("captainUid");

    // A captain may pay a server as a captain for the night - that is the whole
    // point of the per-member "worked as" dropdown.
    await assertSucceeds(setDoc(
        doc(captain, "shifts/" + OPEN_DATE),
        shiftWithWorkedRole("serverUid", "captain", OPEN_DATE),
    ));

    // The server's roster role is untouched, and so is their access.
    const promotedOnPaper = authedDb("serverUid");
    const profile = await getDoc(doc(promotedOnPaper, "users/serverUid"));
    assert.equal(profile.data().role, "server");

    await assertFails(getDocs(collection(promotedOnPaper, "users")));
    await assertFails(getDoc(doc(promotedOnPaper, "users/captainUid")));
    await assertFails(getDoc(doc(promotedOnPaper, "shifts/" + OPEN_DATE)));
    await assertFails(setDoc(doc(promotedOnPaper, "shifts/" + OPEN_DATE), validShift()));
    await assertFails(getDoc(doc(promotedOnPaper, `payouts/${CLOSED_DATE}/entries/captainUid`)));
    await assertFails(setDoc(doc(promotedOnPaper, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertFails(updateDoc(doc(promotedOnPaper, "users/pendingUid"), { status: "active" }));

    // Nor can a captain write themselves the tier through the floor plan.
    await assertFails(updateDoc(doc(captain, CONFIG_PATH), { managerUid: "captainUid" }));
});

test("PROPOSED: the legacy admin keeps full authority alongside the manager", async () => {
    const db = authedDb("adminUid");

    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift()));
    await assertSucceeds(updateDoc(doc(db, "users/pendingUid"), { status: "active", role: "server" }));
    await assertSucceeds(deleteDoc(doc(db, "unregisteredStaff/tempOne")));
    await assertSucceeds(setDoc(doc(db, `users/serverUid/tips/${OPEN_DATE}`), validLegacyTip()));
    await assertSucceeds(deleteDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await assertSucceeds(setDoc(doc(db, "auditEvents/adminRemoval"), validAuditEvent({
        operationId: "adminRemoval",
        type: "shift_removed",
    })));

    // The one thing the legacy account is not is the manager: the pointer names
    // exactly one uid, and retargeting it is that person's alone.
    await assertFails(updateDoc(doc(db, CONFIG_PATH), { managerUid: "adminUid" }));
});
