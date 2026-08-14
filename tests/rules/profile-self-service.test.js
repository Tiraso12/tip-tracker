// What a person may write to their OWN profile, and nothing wider.
//
// Self-service is field-scoped: names and the login handle, never role, status
// or the Supervisor switch, and never on somebody else's document. The two
// multi-document cases are here for the same reason - a name change restamps the
// actor on open floor plans but never on settled history, and claiming a handle
// releases the old mapping in the same batch, so a collision leaves neither
// orphaned.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
    deleteDoc,
    doc,
    FieldPath,
    getDoc,
    setDoc,
    updateDoc,
    writeBatch,
} from "firebase/firestore";

const PROJECT_ID = "demo-tip-tracker-profile-self-service";
const rules = readFileSync("firestore.rules", "utf8");
const OPEN_DATE = "2026-06-01";
const CLOSED_DATE = "2026-05-31";

let testEnv;

function profile(uid, overrides = {}) {
    return {
        uid,
        username: overrides.username || uid,
        firstName: overrides.firstName || uid,
        lastName: "One",
        email: overrides.email || `${uid}@example.com`,
        role: overrides.role || "server",
        status: overrides.status || "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        ...(overrides.isSupervisor ? { isSupervisor: true } : {}),
    };
}

function shift(date, status, memberUid = "employeeUid") {
    return {
        date,
        status,
        teams: [{
            teamId: "team-1",
            members: [{ uid: memberUid, name: "Old name", role: "server", points: 4 }],
            pools: { sales: "100", tips: "20", gratuity: "10", cash: "5" },
        }],
        barTeam: { members: [], pools: {} },
        runners: [],
        updatedAt: "2026-06-01T12:00:00.000Z",
        ...(status === "closed" ? { closedAt: "2026-06-01T02:00:00.000Z" } : {}),
    };
}

function authedDb(uid, email = `${uid}@example.com`) {
    return testEnv.authenticatedContext(uid, { email }).firestore();
}

test.before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });
});

test.beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "users/managerUid"), profile("managerUid", { role: "unassigned" }));
        await setDoc(doc(db, "users/supervisorUid"), profile("supervisorUid", { role: "captain", isSupervisor: true }));
        await setDoc(doc(db, "users/captainUid"), profile("captainUid", { role: "captain" }));
        await setDoc(doc(db, "users/employeeUid"), profile("employeeUid", { username: "Employee One", firstName: "Employee" }));
        await setDoc(doc(db, "users/otherUid"), profile("otherUid", { username: "Other One", firstName: "Other" }));
        await setDoc(doc(db, "users/inactiveUid"), profile("inactiveUid", { status: "inactive" }));
        await setDoc(doc(db, "restaurant/config"), { managerUid: "managerUid" });
        await setDoc(doc(db, `shifts/${OPEN_DATE}`), shift(OPEN_DATE, "setup"));
        await setDoc(doc(db, `shifts/${CLOSED_DATE}`), shift(CLOSED_DATE, "closed"));
        await setDoc(doc(db, "usernames/employee one"), {
            uid: "employeeUid",
            username: "Employee One",
            email: "employeeUid@example.com",
        });
        await setDoc(doc(db, "usernames/other one"), {
            uid: "otherUid",
            username: "Other One",
            email: "otherUid@example.com",
        });
    });
});

test.after(async () => testEnv.cleanup());

test("employee self-write is field-scoped and rejects every escalation or smuggled field", async () => {
    const db = authedDb("employeeUid");
    const own = doc(db, "users/employeeUid");

    await assertSucceeds(updateDoc(own, { firstName: "Sonia", lastName: "Alvarez Garcia" }));
    await assertFails(updateDoc(own, { role: "captain" }));
    await assertFails(updateDoc(own, { status: "inactive" }));
    await assertFails(updateDoc(own, { isSupervisor: true }));
    await assertFails(updateDoc(own, { email: "moved@example.com" }));
    await assertFails(updateDoc(own, { uid: "otherUid" }));
    await assertFails(updateDoc(own, { createdAt: "2030-01-01T00:00:00.000Z" }));
    await assertFails(updateDoc(own, { hasShiftHistory: true }));
    await assertFails(updateDoc(own, { firstName: "Smuggled", role: "captain", status: "inactive", isSupervisor: true }));
    await assertFails(updateDoc(own, { firstName: "" }));
    await assertFails(updateDoc(own, { firstName: "x".repeat(81) }));
    await assertFails(updateDoc(own, { lastName: "x".repeat(81) }));
    await assertFails(updateDoc(doc(db, "users/otherUid"), { firstName: "Taken over" }));

    const saved = (await getDoc(own)).data();
    assert.equal(saved.firstName, "Sonia");
    assert.equal(saved.role, "server");
    assert.equal(saved.status, "active");
    assert.equal(saved.isSupervisor, undefined);
});

test("captain self-write has the same line and cannot touch anyone else's profile", async () => {
    const db = authedDb("supervisorUid");
    const own = doc(db, "users/supervisorUid");

    await assertSucceeds(updateDoc(own, { firstName: "Captain", lastName: "Renamed" }));
    await assertFails(updateDoc(own, { role: "admin" }));
    await assertFails(updateDoc(own, { status: "inactive" }));
    await assertFails(updateDoc(own, { isSupervisor: false }));
    await assertFails(updateDoc(own, { firstName: "Smuggled", role: "admin", isSupervisor: false }));
    await assertFails(updateDoc(doc(db, "users/employeeUid"), { firstName: "Not theirs" }));
    await assertFails(updateDoc(doc(db, "users/employeeUid"), { role: "captain" }));
    await assertFails(updateDoc(doc(db, "users/employeeUid"), { status: "inactive" }));
});

test("inactive people cannot self-edit while manager authority remains intact", async () => {
    await assertFails(updateDoc(doc(authedDb("inactiveUid"), "users/inactiveUid"), { firstName: "Back door" }));

    const manager = authedDb("managerUid");
    await assertSucceeds(updateDoc(doc(manager, "users/employeeUid"), { role: "captain" }));
    await assertSucceeds(updateDoc(doc(manager, "users/employeeUid"), { status: "inactive" }));
    await assertSucceeds(updateDoc(doc(manager, "users/employeeUid"), { isSupervisor: true }));
});

test("name batch restamps only the actor on setup shifts and never settled history", async () => {
    const db = authedDb("employeeUid");
    const batch = writeBatch(db);
    batch.update(doc(db, "users/employeeUid"), { firstName: "Sonia", lastName: "Alvarez" });
    batch.update(doc(db, `shifts/${OPEN_DATE}`), new FieldPath("memberNames", "employeeUid"), "Sonia");
    await assertSucceeds(batch.commit());

    const open = (await getDoc(doc(authedDb("supervisorUid"), `shifts/${OPEN_DATE}`))).data();
    const closed = (await getDoc(doc(authedDb("supervisorUid"), `shifts/${CLOSED_DATE}`))).data();
    assert.equal(open.memberNames.employeeUid, "Sonia");
    assert.equal(closed.teams[0].members[0].name, "Old name");

    await assertFails(updateDoc(doc(db, `shifts/${CLOSED_DATE}`), new FieldPath("memberNames", "employeeUid"), "Sonia"));
    await assertFails(updateDoc(doc(db, `shifts/${OPEN_DATE}`), new FieldPath("memberNames", "otherUid"), "Other"));
    await assertFails(updateDoc(doc(db, `shifts/${OPEN_DATE}`), { teams: [], memberNames: { employeeUid: "Sonia" } }));
    await assertFails(updateDoc(doc(db, `shifts/${OPEN_DATE}`), new FieldPath("memberNames", "employeeUid"), "A different name"));
});

test("handle mapping is bound to its owner, path, and verified Auth email", async () => {
    const db = authedDb("employeeUid");

    await assertSucceeds(setDoc(doc(db, "usernames/fresh handle"), {
        uid: "employeeUid",
        username: "Fresh Handle",
        email: "employeeUid@example.com",
    }));
    await assertFails(setDoc(doc(db, "usernames/wrong path"), {
        uid: "employeeUid",
        username: "Different Name",
        email: "employeeUid@example.com",
    }));
    await assertFails(setDoc(doc(db, "usernames/wrong email"), {
        uid: "employeeUid",
        username: "Wrong Email",
        email: "otherUid@example.com",
    }));
    await assertFails(setDoc(doc(db, "usernames/wrong owner"), {
        uid: "otherUid",
        username: "Wrong Owner",
        email: "employeeUid@example.com",
    }));
    await assertFails(deleteDoc(doc(db, "usernames/other one")));
    await assertFails(updateDoc(doc(db, "usernames/other one"), { email: "employeeUid@example.com" }));
});

test("handle release and claim is atomic, including collision failure", async () => {
    const db = authedDb("employeeUid");
    const rename = writeBatch(db);
    rename.update(doc(db, "users/employeeUid"), { username: "Sonia Login" });
    rename.delete(doc(db, "usernames/employee one"));
    rename.set(doc(db, "usernames/sonia login"), {
        uid: "employeeUid",
        username: "Sonia Login",
        email: "employeeUid@example.com",
    });
    await assertSucceeds(rename.commit());
    assert.equal((await getDoc(doc(db, "users/employeeUid"))).data().username, "Sonia Login");
    assert.equal((await getDoc(doc(db, "usernames/employee one"))).exists(), false);
    assert.equal((await getDoc(doc(db, "usernames/sonia login"))).data().uid, "employeeUid");

    const collision = writeBatch(db);
    collision.update(doc(db, "users/employeeUid"), { username: "Other One" });
    collision.delete(doc(db, "usernames/sonia login"));
    collision.set(doc(db, "usernames/other one"), {
        uid: "employeeUid",
        username: "Other One",
        email: "employeeUid@example.com",
    });
    await assertFails(collision.commit());
    assert.equal((await getDoc(doc(db, "users/employeeUid"))).data().username, "Sonia Login");
    assert.equal((await getDoc(doc(db, "usernames/sonia login"))).exists(), true);
    assert.equal((await getDoc(doc(db, "usernames/other one"))).data().uid, "otherUid");
});
