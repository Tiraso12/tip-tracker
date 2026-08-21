import assert from "node:assert/strict";
import test from "node:test";

import { ASSIGNABLE_ROLES, roleSeniorityRank } from "./roleLabels.js";

// The roster's order is this rank plus a name tie-break, so these tests are what
// pin "captain first, runner last" for the Team screen.
function sortLikeRoster(people) {
    return [...people].sort((left, right) => {
        const seniorityDifference = roleSeniorityRank(left.role) - roleSeniorityRank(right.role);
        return seniorityDifference || left.name.localeCompare(right.name);
    }).map((person) => person.name);
}

test("seniority ranks follow the canonical assignable-role order", () => {
    assert.deepEqual(
        ASSIGNABLE_ROLES.map(roleSeniorityRank),
        ASSIGNABLE_ROLES.map((_, index) => index)
    );
    assert.equal(roleSeniorityRank("captain"), 0);
    assert.ok(roleSeniorityRank("captain") < roleSeniorityRank("runner"));
});

test("a role with no place in the order ranks after runner, never among them", () => {
    const trailing = ASSIGNABLE_ROLES.length;
    assert.equal(roleSeniorityRank("unassigned"), trailing);
    assert.equal(roleSeniorityRank("admin"), trailing);
    assert.equal(roleSeniorityRank(undefined), trailing);
    assert.equal(roleSeniorityRank(null), trailing);
    assert.equal(roleSeniorityRank("sommelier"), trailing);
    assert.ok(roleSeniorityRank("runner") < trailing);
});

test("the roster reads captain down to runner, with names breaking ties", () => {
    const people = [
        { name: "Rita", role: "runner" },
        { name: "Bea", role: "bartender" },
        { name: "Cal", role: "captain" },
        { name: "Amy", role: "assistant" },
        { name: "Sam", role: "server" },
        { name: "Abe", role: "server" },
        { name: "Ben", role: "back" },
    ];
    assert.deepEqual(sortLikeRoster(people), ["Cal", "Abe", "Sam", "Ben", "Amy", "Bea", "Rita"]);
});

test("people with no role or an unknown one stay in the list, grouped after runner", () => {
    const people = [
        { name: "Zoe", role: "unassigned" },
        { name: "Cal", role: "captain" },
        { name: "Nia", role: undefined },
        { name: "Rita", role: "runner" },
        { name: "Ada", role: "sommelier" },
    ];
    assert.deepEqual(sortLikeRoster(people), ["Cal", "Rita", "Ada", "Nia", "Zoe"]);
});

test("a temporary profile sorts by its role like anybody else", () => {
    const people = [
        { name: "Rita", role: "runner" },
        { name: "Temp Server (Temp)", role: "server", isTemp: true },
        { name: "Cal", role: "captain" },
    ];
    assert.deepEqual(sortLikeRoster(people), ["Cal", "Temp Server (Temp)", "Rita"]);
});
