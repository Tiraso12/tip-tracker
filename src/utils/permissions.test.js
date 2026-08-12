import test from "node:test";
import assert from "node:assert/strict";

import { canApproveAccounts } from "./permissions.js";

test("an active admin may approve accounts", () => {
    assert.equal(canApproveAccounts({ role: "admin", status: "active" }), true);
});

test("an admin whose own profile is not active may not approve accounts", () => {
    assert.equal(canApproveAccounts({ role: "admin", status: "pending" }), false);
    assert.equal(canApproveAccounts({ role: "admin", status: "inactive" }), false);
    assert.equal(canApproveAccounts({ role: "admin" }), false);
});

test("staff roles may not approve accounts", () => {
    for (const role of ["captain", "server", "back", "assistant", "bartender", "runner", "unassigned"]) {
        assert.equal(canApproveAccounts({ role, status: "active" }), false, `${role} must not approve`);
    }
});

test("a missing user may not approve accounts", () => {
    assert.equal(canApproveAccounts(null), false);
    assert.equal(canApproveAccounts(undefined), false);
    assert.equal(canApproveAccounts({}), false);
});
