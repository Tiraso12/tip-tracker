import assert from "node:assert/strict";
import test from "node:test";

import {
    canAddTempStaff,
    canApproveAccounts,
    canAssignRoles,
    canBuildFloorPlan,
    canCorrectSettledDay,
    canDeactivateAccounts,
    canMergeTempStaff,
    canOpenShiftWorkspace,
    canReadColleaguePay,
    canReadRoster,
    canRemoveSettledDay,
    canSettleUp,
    canTransferManagerTier,
} from "./permissions.js";

// --- The approve-accounts capability, unchanged by the tier definitions ------
// These pin that repointing canApproveAccounts at the manager tier took nothing
// away: with no manager named, it still resolves to exactly an active admin.

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

// --- The tier definitions ---------------------------------------------------

const MANAGER_CAPABILITIES = {
    canApproveAccounts,
    canAssignRoles,
    canDeactivateAccounts,
    canMergeTempStaff,
    canRemoveSettledDay,
    canTransferManagerTier,
};

const CAPTAIN_CAPABILITIES = {
    canOpenShiftWorkspace,
    canBuildFloorPlan,
    canAddTempStaff,
    canSettleUp,
    canCorrectSettledDay,
    canReadRoster,
    canReadColleaguePay,
};

function assertTier(user, { manager, captain }, label) {
    for (const [name, can] of Object.entries(MANAGER_CAPABILITIES)) {
        assert.equal(can(user), manager, `${label}: ${name} should be ${manager}`);
    }
    for (const [name, can] of Object.entries(CAPTAIN_CAPABILITIES)) {
        assert.equal(can(user), captain, `${label}: ${name} should be ${captain}`);
    }
}

const NOTHING = { manager: false, captain: false };
const CAPTAIN_ONLY = { manager: false, captain: true };
const EVERYTHING = { manager: true, captain: true };

test("with no manager named, the legacy admin is still the only authority", () => {
    assertTier({ uid: "adminUid", role: "admin", status: "active", managerUid: null }, EVERYTHING, "admin");
    assertTier({ uid: "captainUid", role: "captain", status: "active", managerUid: null }, NOTHING, "captain");
    assertTier({ uid: "serverUid", role: "server", status: "active", managerUid: null }, NOTHING, "server");
    assertTier({ uid: "newUid", role: "unassigned", status: "pending", managerUid: null }, NOTHING, "pending");
    assertTier(null, NOTHING, "signed out");
    assertTier(undefined, NOTHING, "loading");
});

test("an inactive account holds nothing, whatever its role", () => {
    assertTier({ uid: "adminUid", role: "admin", status: "inactive", managerUid: null }, NOTHING, "inactive admin");
    assertTier({ uid: "captainUid", role: "captain", status: "inactive", managerUid: "managerUid" }, NOTHING, "inactive captain");
    assertTier({ uid: "managerUid", role: "unassigned", status: "inactive", managerUid: "managerUid" }, NOTHING, "inactive manager");
    assertTier({ uid: "adminUid", role: "admin", status: "profile_error", managerUid: null }, NOTHING, "unreadable profile");
});

test("the manager tier comes from the pointer, never from a role value", () => {
    // The manager does not work a section, so their roster role carries no pay
    // weight at all - and it is not what makes them the manager.
    assertTier({ uid: "managerUid", role: "unassigned", status: "active", managerUid: "managerUid" }, EVERYTHING, "manager");

    // Same person, pointer aimed elsewhere: captain by roster role, nothing more.
    assertTier({ uid: "captainUid", role: "captain", status: "active", managerUid: "managerUid" }, CAPTAIN_ONLY, "captain");

    // A roster role of "manager" would be meaningless - the pointer is the tier.
    assertTier({ uid: "pretenderUid", role: "manager", status: "active", managerUid: "managerUid" }, NOTHING, "self-styled manager");
});

test("a captain gains the workspace but none of the manager-only capabilities", () => {
    const captain = { uid: "captainUid", role: "captain", status: "active", managerUid: "managerUid" };

    assert.equal(canSettleUp(captain), true);
    assert.equal(canBuildFloorPlan(captain), true);
    assert.equal(canAddTempStaff(captain), true);
    assert.equal(canCorrectSettledDay(captain), true);
    assert.equal(canReadRoster(captain), true);
    assert.equal(canReadColleaguePay(captain), true);

    assert.equal(canApproveAccounts(captain), false);
    assert.equal(canAssignRoles(captain), false);
    assert.equal(canMergeTempStaff(captain), false);
    assert.equal(canRemoveSettledDay(captain), false);
    assert.equal(canTransferManagerTier(captain), false);

    // Correcting a settled day and removing one are deliberately different acts.
    assert.notEqual(canCorrectSettledDay(captain), canRemoveSettledDay(captain));
});

test("the floor plan's worked-as role grants nothing", () => {
    // Everything a floor-plan member row carries - the "worked as" role, the
    // points, the team - is pay weight for one night. None of it is permission,
    // because any floor-plan editor can change that dropdown.
    const paidAsCaptainTonight = {
        uid: "serverUid",
        role: "server",
        status: "active",
        managerUid: "managerUid",
        workedRole: "captain",
        points: 4,
        teamId: "team-1",
    };

    assertTier(paidAsCaptainTonight, NOTHING, "server working captain");
});

test("the legacy admin keeps full authority after a manager is named", () => {
    assertTier({ uid: "adminUid", role: "admin", status: "active", managerUid: "managerUid" }, EVERYTHING, "admin alongside manager");
});
