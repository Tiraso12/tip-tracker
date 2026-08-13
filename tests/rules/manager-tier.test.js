// The three-tier model - Manager > Captain > Employee - once a manager exists.
//
// Everything here runs with restaurant/config seeded, which is what makes the
// tiers live. Two structural facts this suite exists to prove:
//
//   - The manager's own users/{uid} document deliberately carries
//     `role: "unassigned"`: the tier comes from the pointer and from nothing
//     else, so a role value can neither grant it nor be confused for it.
//   - The captain tier comes from the "Supervisor" switch (users.isSupervisor)
//     and NOT from the job title. captainUid and supervisorUid below share the
//     role "captain" - one has the switch, one does not - and they must come out
//     of every probe with different access. trustedServerUid holds the switch
//     with a server's title, and must come out with a supervisor's access.
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
    supervisorDoc,
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

        // The manager's job title is NOT what makes them the manager, and they
        // hold no switch of their own. They do not work a section and are not
        // paid from the pool, so they carry no pay weight at all.
        await setDoc(doc(db, "users/managerUid"), userDoc("managerUid", "unassigned", "active", "Manager"));
        await setDoc(doc(db, "users/adminUid"), userDoc("adminUid", "admin", "active", "Admin"));

        // Same title, different switch. This pair is the whole model.
        await setDoc(doc(db, "users/supervisorUid"), supervisorDoc("supervisorUid", "captain", "active", "Captain Supervisor"));
        await setDoc(doc(db, "users/captainUid"), userDoc("captainUid", "captain", "active", "Captain One"));

        // A trusted server given the switch, with no new title invented for them.
        await setDoc(doc(db, "users/trustedServerUid"), supervisorDoc("trustedServerUid", "server", "active", "Server Trusted"));

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

// Every capability the captain tier carries, refused. Used to prove that a
// captain with the switch off is an ordinary employee and nothing more. Each
// probe names itself so a regression says which capability leaked, not just
// which line failed.
async function assertNoCaptainAccess(db, uid, label) {
    const refused = async (what, operation) => {
        try {
            await assertFails(operation);
        } catch (error) {
            error.message = `${label} was allowed to ${what}: ${error.message}`;
            throw error;
        }
    };

    // Someone else's documents, whoever the actor is - their own are theirs.
    const colleague = uid === "serverUid" ? "otherServerUid" : "serverUid";

    // Reading the roster and colleagues' pay.
    await refused("list the roster", getDocs(collection(db, "users")));
    await refused("read a colleague's profile", getDoc(doc(db, "users/" + colleague)));
    await refused("read a colleague's legacy tips", getDoc(doc(db, `users/${colleague}/tips/${CLOSED_DATE}`)));
    await refused("read a colleague's payout", getDoc(doc(db, `payouts/${CLOSED_DATE}/entries/${colleague}`)));
    await refused("scan a settled night", getDocs(collection(db, `payouts/${CLOSED_DATE}/entries`)));
    await refused("scan every night", getDocs(collection(db, "payouts")));

    // Reaching the shift workspace and building a floor plan.
    await refused("read a shift", getDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await refused("build a floor plan", setDoc(doc(db, "shifts/" + OPEN_DATE), validShift(OPEN_DATE, { status: "setup" })));

    // Adding temporary staff.
    await refused("list temp staff", getDocs(collection(db, "unregisteredStaff")));
    await refused("add temp staff", setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));

    // Entering money, and the audit trail that goes with it.
    await refused("write the ledger meta", setDoc(doc(db, "payouts/" + OPEN_DATE), validPayoutMeta()));
    await refused("pay someone", setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await refused("stamp history flags", updateDoc(doc(db, "users/" + colleague), { hasShiftHistory: true, hasTipHistory: true }));
    await refused("read the audit trail", getDocs(collection(db, "auditEvents")));
    await refused("close a shift", setDoc(doc(db, "auditEvents/" + uid + "Close"), validAuditEvent({ operationId: uid + "Close" })));

    // Correcting an already-settled day - every write in that batch.
    await refused("rewrite a settled shift", setDoc(doc(db, "shifts/" + CLOSED_DATE), validShift(CLOSED_DATE)));
    await refused("rewrite a settled ledger meta", setDoc(doc(db, "payouts/" + CLOSED_DATE), validPayoutMeta(CLOSED_DATE)));
    await refused("rewrite a settled payout", setDoc(
        doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`),
        validPayoutEntry(CLOSED_DATE, "serverUid", { total: 175, tips: 125 }),
    ));
    await refused("drop a settled payout", deleteDoc(doc(db, `payouts/${CLOSED_DATE}/entries/${colleague}`)));
    await refused("recalculate a settled day", setDoc(doc(db, "auditEvents/" + uid + "Recalc"), validAuditEvent({
        operationId: uid + "Recalc",
        type: "shift_recalculated",
    })));

    // ...and every manager-only capability, which was never theirs either.
    await refused("approve an account", updateDoc(doc(db, "users/pendingUid"), { status: "active" }));
    await refused("assign a job title", updateDoc(doc(db, "users/" + colleague), { role: "captain" }));
    await refused("move the Supervisor switch", updateDoc(doc(db, "users/" + colleague), { isSupervisor: true }));
    await refused("grant themselves the switch", updateDoc(doc(db, "users/" + uid), { isSupervisor: true }));
    await refused("merge a temp profile", deleteDoc(doc(db, "unregisteredStaff/tempOne")));
    await refused("remove a settled day", deleteDoc(doc(db, "shifts/" + CLOSED_DATE)));
    await refused("take the manager pointer", updateDoc(doc(db, CONFIG_PATH), { managerUid: uid }));

    // Their own profile and their own pay stay theirs, as for any employee.
    await assertSucceeds(getDoc(doc(db, "users/" + uid)));
}

test("PROPOSED: a supervisor can build a floor plan, settle money, and audit it", async () => {
    const db = authedDb("supervisorUid");

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

test("PROPOSED: the switch carries the tier whatever the job title - a trusted server runs the night", async () => {
    const db = authedDb("trustedServerUid");

    // Their title is still "server", and it is still what they are paid as.
    const profile = await getDoc(doc(db, "users/trustedServerUid"));
    assert.equal(profile.data().role, "server");

    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift(OPEN_DATE, { status: "setup" })));
    await assertSucceeds(setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertSucceeds(setDoc(doc(db, "payouts/" + OPEN_DATE), validPayoutMeta()));
    await assertSucceeds(setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await assertSucceeds(setDoc(doc(db, "auditEvents/trustedClose"), validAuditEvent({ operationId: "trustedClose" })));

    // ...and it stops exactly where a supervisor's does.
    await assertFails(updateDoc(doc(db, "users/pendingUid"), { status: "active" }));
    await assertFails(deleteDoc(doc(db, "shifts/" + CLOSED_DATE)));
});

// ACCEPTANCE CRITERION: a captain with the switch off is an ordinary employee.
// Same job title as supervisorUid, same pay weight, and none of the access.
test("PROPOSED: a captain with Supervisor off has exactly an employee's access", async () => {
    const titledCaptain = authedDb("captainUid");

    const profile = await getDoc(doc(titledCaptain, "users/captainUid"));
    assert.equal(profile.data().role, "captain");
    assert.equal(profile.data().isSupervisor, undefined, "absent must read as off");

    await assertNoCaptainAccess(titledCaptain, "captainUid", "captain with the switch off");

    // Which is the same answer an ordinary server gets, capability for
    // capability - the title made no difference anywhere.
    await assertNoCaptainAccess(authedDb("serverUid"), "serverUid", "server");

    // And the switch explicitly set to false reads the same as absent.
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "users/captainUid"), { isSupervisor: false });
    });
    await assertNoCaptainAccess(authedDb("captainUid"), "captainUid", "captain with the switch explicitly off");
});

test("PROPOSED: a supervisor can read ANOTHER person's pay history, employees still cannot", async () => {
    const supervisor = authedDb("supervisorUid");
    await assertSucceeds(getDoc(doc(supervisor, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(getDocs(collection(supervisor, `payouts/${CLOSED_DATE}/entries`)));
    await assertSucceeds(getDoc(doc(supervisor, "users/serverUid")));
    await assertSucceeds(getDoc(doc(supervisor, `users/serverUid/tips/${CLOSED_DATE}`)));

    const server = authedDb("serverUid");
    await assertSucceeds(getDoc(doc(server, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(getDoc(doc(server, `users/serverUid/tips/${CLOSED_DATE}`)));
    await assertFails(getDoc(doc(server, `payouts/${CLOSED_DATE}/entries/captainUid`)));
    await assertFails(getDocs(collection(server, `payouts/${CLOSED_DATE}/entries`)));
    await assertFails(getDocs(collection(server, "users")));
    await assertFails(getDoc(doc(server, "users/captainUid")));
});

test("PROPOSED: a supervisor cannot approve accounts, assign roles, merge, or remove a day", async () => {
    const db = authedDb("supervisorUid");

    // Approvals and role assignment are the manager's.
    await assertFails(updateDoc(doc(db, "users/pendingUid"), { status: "active" }));
    await assertFails(updateDoc(doc(db, "users/pendingUid"), { status: "active", role: "server" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { role: "captain" }));
    await assertFails(updateDoc(doc(db, "users/supervisorUid"), { role: "admin" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { status: "inactive" }));
    await assertFails(deleteDoc(doc(db, "users/serverUid")));
    await assertFails(updateDoc(doc(db, "usernames/server one"), { uid: "supervisorUid" }));

    // Settle-up may stamp history flags and nothing else - no smuggled role
    // change, and above all no smuggled switch.
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true, role: "captain" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true, status: "inactive" }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true, isSupervisor: true }));

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
    await assertFails(updateDoc(doc(db, CONFIG_PATH), { managerUid: "supervisorUid" }));
    await assertFails(setDoc(doc(db, CONFIG_PATH), { managerUid: "supervisorUid" }));
    await assertFails(deleteDoc(doc(db, CONFIG_PATH)));
});

// ACCEPTANCE CRITERION: the switch is the manager's alone, and nobody may aim it
// at themselves. Holding the captain tier must never be a way to widen it.
test("PROPOSED: only the manager may move the Supervisor switch, and never onto themselves", async () => {
    // A supervisor cannot hand the switch on, nor keep it from anyone - not by
    // updating one field and not by rewriting the whole profile.
    const supervisor = authedDb("supervisorUid");
    await assertFails(updateDoc(doc(supervisor, "users/serverUid"), { isSupervisor: true }));
    await assertFails(updateDoc(doc(supervisor, "users/captainUid"), { isSupervisor: true }));
    await assertFails(updateDoc(doc(supervisor, "users/trustedServerUid"), { isSupervisor: false }));
    await assertFails(setDoc(
        doc(supervisor, "users/serverUid"),
        userDoc("serverUid", "server", "active", "Server One", { isSupervisor: true }),
    ));

    // A captain with the switch off cannot turn it on for themselves.
    const titledCaptain = authedDb("captainUid");
    await assertFails(updateDoc(doc(titledCaptain, "users/captainUid"), { isSupervisor: true }));

    // Nor can an ordinary employee, on themselves or anyone else.
    const server = authedDb("serverUid");
    await assertFails(updateDoc(doc(server, "users/serverUid"), { isSupervisor: true }));
    await assertFails(updateDoc(doc(server, "users/otherServerUid"), { isSupervisor: true }));

    // Nor can a pending sign-up mint it on the way in - the create rule pins the
    // whole shape of a self-registered profile.
    const newcomer = testEnv.authenticatedContext("newcomerUid").firestore();
    await assertFails(setDoc(doc(newcomer, "users/newcomerUid"), {
        uid: "newcomerUid",
        username: "Newcomer",
        firstName: "Newcomer",
        lastName: "",
        email: "newcomer@example.com",
        role: "unassigned",
        status: "pending",
        isSupervisor: true,
    }));

    // The manager may not aim it at themselves either. They need no switch:
    // the pointer already carries every captain power.
    const manager = authedDb("managerUid");
    await assertFails(updateDoc(doc(manager, "users/managerUid"), { isSupervisor: true }));

    // The legacy admin, who holds manager authority today, is bound by the same
    // self-write ban.
    const admin = authedDb("adminUid");
    await assertFails(updateDoc(doc(admin, "users/adminUid"), { isSupervisor: true }));
    await assertSucceeds(updateDoc(doc(admin, "users/otherServerUid"), { isSupervisor: true }));

    // What the manager CAN do: switch someone else on, and switch someone else
    // off. Both take effect immediately.
    await assertSucceeds(updateDoc(doc(manager, "users/captainUid"), { isSupervisor: true }));
    const switchedOn = authedDb("captainUid");
    await assertSucceeds(getDocs(collection(switchedOn, "users")));
    await assertSucceeds(setDoc(doc(switchedOn, "shifts/" + OPEN_DATE), validShift(OPEN_DATE, { status: "setup" })));

    await assertSucceeds(updateDoc(doc(manager, "users/supervisorUid"), { isSupervisor: false }));
    const switchedOff = authedDb("supervisorUid");
    await assertFails(getDocs(collection(switchedOff, "users")));
    await assertFails(setDoc(doc(switchedOff, "shifts/" + OPEN_DATE), validShift(OPEN_DATE, { status: "setup" })));

    // ...and the person just switched off cannot switch themselves back on.
    await assertFails(updateDoc(doc(switchedOff, "users/supervisorUid"), { isSupervisor: true }));
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
    await assertFails(updateDoc(doc(db, "users/serverUid"), { isSupervisor: true }));
    await assertFails(updateDoc(doc(db, "users/serverUid"), { hasShiftHistory: true }));
    await assertFails(updateDoc(doc(db, CONFIG_PATH), { managerUid: "serverUid" }));

    // Reading who the manager is stays open to any signed-in user - it is one uid,
    // and the client needs it to know whether it holds the tier.
    await assertSucceeds(getDoc(doc(db, CONFIG_PATH)));
});

test("PROPOSED: the manager holds every captain power plus the manager-only ones", async () => {
    const db = authedDb("managerUid");

    // Cumulative - every captain capability, with no switch on their own profile.
    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(setDoc(doc(db, "shifts/" + OPEN_DATE), validShift()));
    await assertSucceeds(setDoc(doc(db, "payouts/" + OPEN_DATE), validPayoutMeta()));
    await assertSucceeds(setDoc(doc(db, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));
    await assertSucceeds(getDoc(doc(db, `payouts/${CLOSED_DATE}/entries/serverUid`)));
    await assertSucceeds(setDoc(doc(db, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertSucceeds(setDoc(doc(db, "auditEvents/closeOperation"), validAuditEvent({ operationId: "closeOperation" })));

    // Manager-only: approvals, roles, the Supervisor switch, deactivation, deletion.
    await assertSucceeds(updateDoc(doc(db, "users/pendingUid"), { status: "active", role: "server" }));
    await assertSucceeds(updateDoc(doc(db, "users/serverUid"), { role: "captain" }));
    await assertSucceeds(updateDoc(doc(db, "users/serverUid"), { isSupervisor: true }));
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

test("PROPOSED: exactly one manager is structural - neither a title nor the switch reaches it", async () => {
    const manager = authedDb("managerUid");

    // The manager's own job title grants nothing; the pointer is the tier.
    const managerProfile = await getDoc(doc(manager, "users/managerUid"));
    assert.equal(managerProfile.data().role, "unassigned");
    assert.equal(managerProfile.data().isSupervisor, undefined);

    // Assigning the captain TITLE hands over pay weight and nothing else.
    await assertSucceeds(updateDoc(doc(manager, "users/serverUid"), { role: "captain" }));
    const titledOnly = authedDb("serverUid");
    await assertFails(getDocs(collection(titledOnly, "users")));
    await assertFails(setDoc(doc(titledOnly, "shifts/" + OPEN_DATE), validShift()));

    // Turning the switch on is what hands over captain powers - and nothing more.
    await assertSucceeds(updateDoc(doc(manager, "users/serverUid"), { isSupervisor: true }));
    const freshSupervisor = authedDb("serverUid");
    await assertSucceeds(getDocs(collection(freshSupervisor, "users")));
    await assertFails(updateDoc(doc(freshSupervisor, "users/pendingUid"), { status: "active" }));
    await assertFails(updateDoc(doc(freshSupervisor, CONFIG_PATH), { managerUid: "serverUid" }));

    // Transfer is one atomic write by the sitting manager. There is no moment
    // with zero or two managers: the pointer holds exactly one uid.
    await assertSucceeds(updateDoc(doc(manager, CONFIG_PATH), { managerUid: "captainUid" }));

    // The incoming manager holds the tier through the pointer alone - their own
    // profile carries the captain title and no switch.
    const incoming = authedDb("captainUid");
    await assertSucceeds(updateDoc(doc(incoming, "users/pendingUid"), { status: "active", role: "server" }));
    await assertSucceeds(deleteDoc(doc(incoming, "unregisteredStaff/tempOne")));

    const outgoing = authedDb("managerUid");
    await assertFails(updateDoc(doc(outgoing, "users/serverUid"), { role: "server" }));
    await assertFails(updateDoc(doc(outgoing, CONFIG_PATH), { managerUid: "managerUid" }));
    // ...and with no switch of their own the outgoing manager keeps nothing.
    await assertFails(getDocs(collection(outgoing, "users")));
    await assertFails(setDoc(doc(outgoing, "shifts/" + OPEN_DATE), validShift()));
    // Nor can they leave themselves the tier on the way out.
    await assertFails(updateDoc(doc(outgoing, "users/managerUid"), { isSupervisor: true }));
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

    // A deactivated supervisor is equally powerless - the switch survives their
    // deactivation and still grants nothing.
    await setStatus("supervisorUid", "inactive");
    let stillSwitchedOn;
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const profile = await getDoc(doc(context.firestore(), "users/supervisorUid"));
        stillSwitchedOn = profile.data().isSupervisor;
    });
    assert.equal(stillSwitchedOn, true);

    const inactiveSupervisor = authedDb("supervisorUid");
    await assertFails(getDocs(collection(inactiveSupervisor, "users")));
    await assertFails(setDoc(doc(inactiveSupervisor, "shifts/" + OPEN_DATE), validShift()));
});

test("PROPOSED: correcting a settled day is captain work; removing it is not, and the paths do not leak", async () => {
    const supervisor = authedDb("supervisorUid");

    // Every write in the correction batch is allowed...
    await assertCorrectionPathAllowed(supervisor, "supervisorRecalc");

    // ...and every write that is unique to the removal batch is not, so the
    // removal cannot commit even though the two share their entry deletes.
    await assertFails(deleteDoc(doc(supervisor, "shifts/" + CLOSED_DATE)));
    await assertFails(deleteDoc(doc(supervisor, "payouts/" + CLOSED_DATE)));
    await assertFails(setDoc(doc(supervisor, "auditEvents/removalBySupervisor"), validAuditEvent({
        operationId: "removalBySupervisor",
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
    const supervisor = authedDb("supervisorUid");

    // A supervisor may pay a server as a captain for the night - that is the
    // whole point of the per-member "worked as" dropdown.
    await assertSucceeds(setDoc(
        doc(supervisor, "shifts/" + OPEN_DATE),
        shiftWithWorkedRole("serverUid", "captain", OPEN_DATE),
    ));

    // The server's job title is untouched, and so is their access.
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

    // Nor can a supervisor write themselves the tier through the floor plan.
    await assertFails(updateDoc(doc(supervisor, CONFIG_PATH), { managerUid: "supervisorUid" }));
});

// The escalation hole the switch could have reopened: the floor plan is written
// by whoever is editing it, so a switch that could be set THERE would let any
// supervisor mint another. Every predicate reads the actor's own users/{uid}.
test("PROPOSED: a Supervisor switch smuggled onto a floor-plan member grants nothing", async () => {
    const supervisor = authedDb("supervisorUid");

    await assertSucceeds(setDoc(
        doc(supervisor, "shifts/" + OPEN_DATE),
        shiftWithWorkedRole("serverUid", "captain", OPEN_DATE, { isSupervisor: true }),
    ));

    const smuggled = authedDb("serverUid");
    const profile = await getDoc(doc(smuggled, "users/serverUid"));
    assert.equal(profile.data().isSupervisor, undefined, "the roster profile is untouched");

    await assertFails(getDocs(collection(smuggled, "users")));
    await assertFails(getDoc(doc(smuggled, "shifts/" + OPEN_DATE)));
    await assertFails(setDoc(doc(smuggled, "shifts/" + OPEN_DATE), validShift()));
    await assertFails(setDoc(doc(smuggled, "unregisteredStaff/tempTwo"), validTempStaff("tempTwo")));
    await assertFails(setDoc(doc(smuggled, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));

    // And a supervisor cannot promote themselves by writing the roster either.
    await assertFails(updateDoc(doc(supervisor, "users/serverUid"), { isSupervisor: true }));
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

// The pointer is created and destroyed out of band or not at all. This is what
// makes docs/MANAGER-CHANGEOVER.md a console procedure rather than a screen: no
// client may mint a manager, and no client may leave the restaurant without one.
// Only the sitting manager may retarget it, which is the atomic hand-over.
test("PROPOSED: nobody may create or delete the manager pointer, the manager included", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await deleteDoc(doc(context.firestore(), CONFIG_PATH));
    });

    // With the pointer gone the tiers are dormant again, so the legacy admin is
    // the only authority left - and even they cannot mint a manager.
    for (const uid of ["adminUid", "managerUid", "supervisorUid", "serverUid"]) {
        await assertFails(setDoc(doc(authedDb(uid), CONFIG_PATH), { managerUid: uid }));
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), CONFIG_PATH), { managerUid: "managerUid" });
    });

    // Nor may the sitting manager stand the restaurant down by deleting it. The
    // pointer is only ever retargeted, so there is no moment with no manager.
    await assertFails(deleteDoc(doc(authedDb("managerUid"), CONFIG_PATH)));
    await assertFails(deleteDoc(doc(authedDb("adminUid"), CONFIG_PATH)));

    // The shape is pinned too: the pointer holds a manager and a timestamp and
    // nothing else, so it cannot grow into a second place permissions live.
    const manager = authedDb("managerUid");
    await assertFails(updateDoc(doc(manager, CONFIG_PATH), { managerUid: "captainUid", isSupervisor: true }));
    await assertFails(updateDoc(doc(manager, CONFIG_PATH), { managerUid: 42 }));
    await assertSucceeds(updateDoc(doc(manager, CONFIG_PATH), {
        managerUid: "captainUid",
        updatedAt: `${OPEN_DATE}T15:00:00.000Z`,
    }));
});

// The exact state the cutover creates, and the one production sits in the
// morning after: the pointer names the person who ALREADY holds `role: "admin"`.
// Both authorities land on the same account, and the point of the release is
// that this changes nothing for anyone - see docs/MANAGER-CHANGEOVER.md.
test("PROPOSED: the cutover state - the pointer names today's admin - takes nothing from anyone", async () => {
    await repointManager("adminUid");

    // The captain, holding both authorities at once, keeps every one of them.
    const admin = authedDb("adminUid");
    await assertSucceeds(getDocs(collection(admin, "users")));
    await assertSucceeds(updateDoc(doc(admin, "users/pendingUid"), { status: "active", role: "server" }));
    await assertSucceeds(deleteDoc(doc(admin, "unregisteredStaff/tempOne")));
    await assertSucceeds(deleteDoc(doc(admin, "shifts/" + CLOSED_DATE)));

    // ...and gains the one thing only the pointer carries: handing the tier on.
    await assertSucceeds(updateDoc(doc(admin, CONFIG_PATH), { managerUid: "adminUid" }));

    // The person the pointer used to name keeps nothing. No role, no switch, no
    // tier - which is what makes writing the previous value back a real undo.
    const formerManager = authedDb("managerUid");
    await assertFails(getDocs(collection(formerManager, "users")));
    await assertFails(updateDoc(doc(formerManager, CONFIG_PATH), { managerUid: "managerUid" }));

    // Supervisor is still OFF for the captain who was never given it, which is
    // exactly why the changeover has to happen between services: until the
    // manager turns the switch on, nobody but them can settle up.
    await assertNoCaptainAccess(authedDb("captainUid"), "captainUid", "captain with the switch off");

    // The manager turns it on, and that captain can run the night.
    await assertSucceeds(updateDoc(doc(admin, "users/captainUid"), { isSupervisor: true }));
    const switchedOn = authedDb("captainUid");
    await assertSucceeds(setDoc(doc(switchedOn, "shifts/" + OPEN_DATE), validShift(OPEN_DATE, { status: "setup" })));
    await assertSucceeds(setDoc(doc(switchedOn, `payouts/${OPEN_DATE}/entries/serverUid`), validPayoutEntry()));

    // ...and not a step further. Each of these changes a real value: an update
    // whose diff is empty passes the history-flags gate because it affects no
    // keys, so a probe that rewrites a value with itself proves nothing.
    await assertFails(updateDoc(doc(switchedOn, "users/inactiveUid"), { status: "active" }));
    await assertFails(updateDoc(doc(switchedOn, "users/serverUid"), { role: "captain" }));
    await assertFails(deleteDoc(doc(switchedOn, "shifts/" + OPEN_DATE)));
});
