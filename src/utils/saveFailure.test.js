import assert from "node:assert/strict";
import test from "node:test";

import { describeSaveFailure, findNamelessParticipants } from "./saveFailure.js";

const permissionDenied = () => Object.assign(new Error("Missing or insufficient permissions."), {
    code: "permission-denied",
});

test("a nameless profile is found by uid and identified by whatever it does carry", () => {
    const names = findNamelessParticipants({
        participantUids: ["onFloor", "alsoOnFloor"],
        employees: [
            { uid: "onFloor", firstName: "", lastName: "Alvarez", username: "salvarez" },
            { uid: "alsoOnFloor", firstName: "   ", lastName: "", username: "bmartin" },
            { uid: "notOnFloor", firstName: "", lastName: "Someone Else" },
            { uid: "fine", firstName: "Sonia", lastName: "Alvarez" },
        ],
    });

    assert.deepEqual(names, ["Alvarez", "bmartin"]);
});

test("everyone named means nobody is reported", () => {
    assert.deepEqual(findNamelessParticipants({
        participantUids: ["a"],
        employees: [{ uid: "a", firstName: "Sonia" }],
    }), []);
});

// The point of the whole exercise: the refusal names the person, because the batch
// itself names nobody.
test("a refused save names the profiles that caused it", () => {
    const failure = describeSaveFailure(permissionDenied(), { namelessParticipants: ["Alvarez"] });

    assert.match(failure.headline, /no first name/);
    assert.deepEqual(failure.names, ["Alvarez"]);
    assert.match(failure.body, /Team management/);
});

test("a refusal with every profile named does not blame the names", () => {
    const failure = describeSaveFailure(permissionDenied(), { namelessParticipants: [] });

    assert.deepEqual(failure.names, []);
    assert.doesNotMatch(failure.headline, /first name/);
});

test("a deleted account is described as a deleted account", () => {
    const failure = describeSaveFailure(Object.assign(new Error("No document to update"), { code: "not-found" }));

    assert.match(failure.headline, /no longer has an account/);
});

test("the reconciliation throw is translated out of engine wording", () => {
    const failure = describeSaveFailure(new Error(
        "Payout reconciliation failed: Available money does not reconcile with distributed money. Difference: 100.00."
    ));

    assert.match(failure.headline, /does not balance/);
    assert.doesNotMatch(failure.headline + failure.body, /reconcile/);
});

// An error nobody anticipated must still reach the screen rather than being
// flattened into four words, which is what the old catch path did.
test("an unrecognised error keeps its own text", () => {
    const failure = describeSaveFailure(new Error("network request failed"));

    assert.equal(failure.detail, "network request failed");
});
