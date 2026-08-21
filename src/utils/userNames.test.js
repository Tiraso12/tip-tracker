import assert from "node:assert/strict";
import test from "node:test";

import {
    firstNameFor,
    fullNameFor,
    tempStaffNameFor,
    tempStaffRosterNameFor,
} from "./userNames.js";

test("registered names use the dedicated fields and never the login handle", () => {
    const person = {
        firstName: "Sonia",
        lastName: "Alvarez Garcia",
        username: "sonia-login",
        name: "stale-name",
    };

    assert.equal(firstNameFor(person), "Sonia");
    assert.equal(fullNameFor(person), "Sonia Alvarez Garcia");
});

test("single-word names do not invent a last name", () => {
    const person = { firstName: "Prince", lastName: "" };

    assert.equal(firstNameFor(person), "Prince");
    assert.equal(fullNameFor(person), "Prince");
});

test("missing registered name fields do not fall back to the login handle", () => {
    assert.equal(firstNameFor({ username: "login-only" }), "Unnamed person");
    assert.equal(fullNameFor({ username: "login-only" }), "Unnamed person");
});

test("temporary staff keep their existing explicit display choices", () => {
    const person = { name: "Temp Staff (Temp)", username: "Temp Staff" };

    assert.equal(tempStaffNameFor(person), "Temp Staff (Temp)");
    assert.equal(tempStaffRosterNameFor(person), "Temp Staff");
});
