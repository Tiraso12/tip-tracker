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
    canSetSupervisor,
    canSettleUp,
    canTransferManagerTier,
    hasOwnPayRecord,
    isPaidFromPool,
    tierLabel,
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
    canSetSupervisor,
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

    // The switch is dormant with the rest of the tier: turning it on before the
    // restaurant names a manager grants nothing at all.
    assertTier(
        { uid: "supervisorUid", role: "captain", status: "active", isSupervisor: true, managerUid: null },
        NOTHING,
        "supervisor before the cutover",
    );
});

test("an inactive account holds nothing, whatever its role or switch", () => {
    assertTier({ uid: "adminUid", role: "admin", status: "inactive", managerUid: null }, NOTHING, "inactive admin");
    assertTier(
        { uid: "supervisorUid", role: "captain", status: "inactive", isSupervisor: true, managerUid: "managerUid" },
        NOTHING,
        "inactive supervisor",
    );
    assertTier({ uid: "managerUid", role: "unassigned", status: "inactive", managerUid: "managerUid" }, NOTHING, "inactive manager");
    assertTier({ uid: "adminUid", role: "admin", status: "profile_error", managerUid: null }, NOTHING, "unreadable profile");
});

test("the manager tier comes from the pointer, never from a role value", () => {
    // The manager does not work a section, so their job title carries no pay
    // weight at all - and it is not what makes them the manager.
    assertTier({ uid: "managerUid", role: "unassigned", status: "active", managerUid: "managerUid" }, EVERYTHING, "manager");

    // The manager holds every captain power without a switch of their own.
    assertTier(
        { uid: "managerUid", role: "unassigned", status: "active", isSupervisor: false, managerUid: "managerUid" },
        EVERYTHING,
        "manager with the switch explicitly off",
    );

    // A roster role of "manager" would be meaningless - the pointer is the tier.
    assertTier({ uid: "pretenderUid", role: "manager", status: "active", managerUid: "managerUid" }, NOTHING, "self-styled manager");
});

// THE CORE OF THIS MODEL: the job title says what someone is paid, the switch
// says what they may do, and neither answers for the other.
test("the captain tier comes from the Supervisor switch, never from the job title", () => {
    const active = { status: "active", managerUid: "managerUid" };

    // A captain on the floor, paid as a captain, who may not edit shifts.
    assertTier({ uid: "captainUid", role: "captain", ...active }, NOTHING, "captain, switch off");
    assertTier({ uid: "captainUid", role: "captain", isSupervisor: false, ...active }, NOTHING, "captain, switch explicitly off");

    // The same title with the switch on.
    assertTier({ uid: "supervisorUid", role: "captain", isSupervisor: true, ...active }, CAPTAIN_ONLY, "captain, switch on");

    // And a trusted server holding it, with no new title invented for them.
    assertTier({ uid: "trustedUid", role: "server", isSupervisor: true, ...active }, CAPTAIN_ONLY, "server, switch on");

    // Every other title reads the same way, so no title is a back door.
    for (const role of ["server", "back", "assistant", "bartender", "runner", "unassigned"]) {
        assertTier({ uid: "personUid", role, ...active }, NOTHING, `${role}, switch off`);
        assertTier({ uid: "personUid", role, isSupervisor: true, ...active }, CAPTAIN_ONLY, `${role}, switch on`);
    }

    // Only a real `true` is a grant - a stray value in the field is not one.
    for (const notTrue of ["true", "yes", 1, {}, [], "captain"]) {
        assertTier(
            { uid: "captainUid", role: "captain", isSupervisor: notTrue, ...active },
            NOTHING,
            `switch set to ${JSON.stringify(notTrue)}`,
        );
    }
});

test("a supervisor gains the workspace but none of the manager-only capabilities", () => {
    const supervisor = { uid: "supervisorUid", role: "captain", status: "active", isSupervisor: true, managerUid: "managerUid" };

    assert.equal(canSettleUp(supervisor), true);
    assert.equal(canBuildFloorPlan(supervisor), true);
    assert.equal(canAddTempStaff(supervisor), true);
    assert.equal(canCorrectSettledDay(supervisor), true);
    assert.equal(canReadRoster(supervisor), true);
    assert.equal(canReadColleaguePay(supervisor), true);

    assert.equal(canApproveAccounts(supervisor), false);
    assert.equal(canAssignRoles(supervisor), false);
    assert.equal(canMergeTempStaff(supervisor), false);
    assert.equal(canRemoveSettledDay(supervisor), false);
    assert.equal(canTransferManagerTier(supervisor), false);

    // Above all, a supervisor cannot hand the switch on - not to a colleague and
    // not to themselves. It is the manager's alone.
    assert.equal(canSetSupervisor(supervisor), false);

    // Correcting a settled day and removing one are deliberately different acts.
    assert.notEqual(canCorrectSettledDay(supervisor), canRemoveSettledDay(supervisor));
});

test("nobody but manager authority may move the Supervisor switch", () => {
    assert.equal(canSetSupervisor({ uid: "managerUid", role: "unassigned", status: "active", managerUid: "managerUid" }), true);
    assert.equal(canSetSupervisor({ uid: "adminUid", role: "admin", status: "active", managerUid: null }), true);

    assert.equal(canSetSupervisor({ uid: "supervisorUid", role: "captain", status: "active", isSupervisor: true, managerUid: "managerUid" }), false);
    assert.equal(canSetSupervisor({ uid: "captainUid", role: "captain", status: "active", managerUid: "managerUid" }), false);
    assert.equal(canSetSupervisor({ uid: "serverUid", role: "server", status: "active", managerUid: "managerUid" }), false);
    assert.equal(canSetSupervisor(null), false);
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

test("the Supervisor switch is read from the profile, not from anything a shift carries", () => {
    // A floor-plan member row is written by whoever is editing the plan, so a
    // switch smuggled onto one must count for nothing. The capability reads
    // users/{uid}.isSupervisor and firestore.rules reads the same document.
    const smuggled = {
        uid: "serverUid",
        role: "server",
        status: "active",
        managerUid: "managerUid",
        member: { uid: "serverUid", role: "captain", points: 4, isSupervisor: true },
        workedRole: "captain",
    };

    assertTier(smuggled, NOTHING, "switch smuggled onto a floor-plan member");
});

test("the legacy admin keeps full authority after a manager is named", () => {
    assertTier({ uid: "adminUid", role: "admin", status: "active", managerUid: "managerUid" }, EVERYTHING, "admin alongside manager");
});

// --- The tier's name -------------------------------------------------------
// One label, in the captain's vocabulary, for the app bar. It is derived from
// the same predicates as every capability so it can never disagree with what
// the workspace actually offers.

test("the tier label names the tier the viewer holds", () => {
    assert.equal(tierLabel({ uid: "managerUid", role: "unassigned", status: "active", managerUid: "managerUid" }), "Manager");
    assert.equal(tierLabel({ uid: "captainUid", role: "captain", status: "active", managerUid: "managerUid", isSupervisor: true }), "Captain");
});

test("today's admin reads Manager, with or without a manager named", () => {
    assert.equal(tierLabel({ uid: "adminUid", role: "admin", status: "active" }), "Manager");
    assert.equal(tierLabel({ uid: "adminUid", role: "admin", status: "active", managerUid: "managerUid" }), "Manager");
});

test("an employee has no tier to name", () => {
    // Including a captain by job title with the switch off - the badge must not
    // advertise a tier the workspace would refuse.
    assert.equal(tierLabel({ uid: "captainUid", role: "captain", status: "active", managerUid: "managerUid" }), null);
    assert.equal(tierLabel({ uid: "serverUid", role: "server", status: "active", managerUid: "managerUid" }), null);
    assert.equal(tierLabel(null), null);
});

// --- Who the money is for --------------------------------------------------
// Not a permission: whether a pay record EXISTS for someone. It decides whether
// the app has a pay statement to show them at all, so a wrong answer either
// hides a captain's own week or hands the manager an empty page.

test("everyone on the roster is paid from the pool, switch or no switch", () => {
    // The switch moves no money, so a captain holding it has exactly the same
    // pay record as the captain who does not.
    assert.equal(hasOwnPayRecord({ uid: "supervisorUid", role: "captain", status: "active", managerUid: "managerUid", isSupervisor: true }), true);
    assert.equal(hasOwnPayRecord({ uid: "captainUid", role: "captain", status: "active", managerUid: "managerUid" }), true);
    assert.equal(hasOwnPayRecord({ uid: "serverUid", role: "server", status: "active", managerUid: "managerUid" }), true);
});

test("the manager has no pay record - they work no section and take no share", () => {
    // Excluded BY IDENTITY, exactly as the floor-plan pool excludes them, so
    // "assignable to a section" and "has a pay record" cannot drift apart.
    assert.equal(hasOwnPayRecord({ uid: "managerUid", role: "unassigned", status: "active", managerUid: "managerUid" }), false);
});

test("today's legacy admin has no pay record either", () => {
    // Same kind of person as the manager: not on the roster, not in the pay
    // maths. True with or without a manager named.
    assert.equal(hasOwnPayRecord({ uid: "adminUid", role: "admin", status: "active" }), false);
    assert.equal(hasOwnPayRecord({ uid: "adminUid", role: "admin", status: "active", managerUid: "managerUid" }), false);
});

test("nobody is paid from the pool without a person to pay", () => {
    assert.equal(hasOwnPayRecord(null), false);
    assert.equal(isPaidFromPool(undefined, "managerUid"), false);
    // No manager named yet: a missing pointer must not read as "everyone is
    // the manager" through an undefined-equals-undefined comparison.
    assert.equal(isPaidFromPool({ role: "server" }, null), true);
});
