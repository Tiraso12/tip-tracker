import assert from "node:assert/strict";
import test from "node:test";
import {
    applyOpenShiftMemberNames,
    normalizeLoginHandle,
    validateLoginHandle,
    validateWorkName,
} from "./accountProfilePersistence.js";

test("work-name validation trims both fields and keeps two-surname names intact", () => {
    assert.deepEqual(validateWorkName("  Sonia  ", "  Alvarez Garcia "), {
        firstName: "Sonia",
        lastName: "Alvarez Garcia",
    });
    assert.throws(() => validateWorkName("", "Alvarez"), /first name/i);
    assert.throws(() => validateWorkName("x".repeat(81), ""), /80/);
});

test("login handles have one canonical document key", () => {
    assert.equal(normalizeLoginHandle("  Sonia Login "), "sonia login");
    assert.deepEqual(validateLoginHandle(" Sonia Login "), { username: "Sonia Login", key: "sonia login" });
    assert.throws(() => validateLoginHandle("bad/path"), /slash/i);
});

test("only setup shifts apply uid-keyed name stamps", () => {
    const source = {
        status: "setup",
        memberNames: { employeeUid: "Sonia" },
        teams: [{ members: [
            { uid: "employeeUid", name: "Old name" },
            { uid: "otherUid", name: "Other" },
        ] }],
        barTeam: { members: [{ uid: "employeeUid", name: "Old name" }] },
        runners: [{ uid: "employeeUid", name: "Old name" }],
    };
    const updated = applyOpenShiftMemberNames(source);
    assert.equal(updated.teams[0].members[0].name, "Sonia");
    assert.equal(updated.teams[0].members[1].name, "Other");
    assert.equal(updated.barTeam.members[0].name, "Sonia");
    assert.equal(updated.runners[0].name, "Sonia");

    const closed = { ...source, status: "closed" };
    assert.equal(applyOpenShiftMemberNames(closed), closed);
    assert.equal(closed.teams[0].members[0].name, "Old name");
});
