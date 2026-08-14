import assert from "node:assert/strict";
import test from "node:test";

import { planUserProfileNameBackfill } from "./userProfileNameBackfill.js";

test("backfill copies the entire username into firstName without guessing", () => {
    const plan = planUserProfileNameBackfill([
        { id: "two-surnames", data: { username: "Sonia Alvarez Garcia" } },
        { id: "single-word", data: { username: "Prince" } },
    ]);

    assert.deepEqual(plan.writes, [
        { id: "two-surnames", data: { firstName: "Sonia Alvarez Garcia", lastName: "" } },
        { id: "single-word", data: { firstName: "Prince", lastName: "" } },
    ]);
    assert.deepEqual(plan.counts, { scanned: 2, changed: 2, skipped: 0, invalid: 0 });
});

test("backfill is re-runnable and preserves existing name fields", () => {
    const plan = planUserProfileNameBackfill([
        { id: "complete", data: { username: "login", firstName: "Sonia", lastName: "Alvarez Garcia" } },
        { id: "missing-last", data: { username: "Prince", firstName: "Prince" } },
    ]);

    assert.deepEqual(plan.writes, [
        { id: "missing-last", data: { lastName: "" } },
    ]);
    assert.deepEqual(plan.skipped, ["complete"]);
});

test("backfill stops short of inventing a first name without a legacy username", () => {
    const plan = planUserProfileNameBackfill([{ id: "broken", data: {} }]);

    assert.deepEqual(plan.writes, []);
    assert.deepEqual(plan.invalid, [{ id: "broken", reason: "missing username for firstName backfill" }]);
});

// The rules reject an empty firstName, so treating one as "already present" is
// the exact profile this backfill exists to fix being left blocking.
test("backfill fills an empty or whitespace-only firstName", () => {
    const plan = planUserProfileNameBackfill([
        { id: "empty", data: { username: "sonia", firstName: "", lastName: "" } },
        { id: "whitespace", data: { username: " prince ", firstName: "   ", lastName: "" } },
    ]);

    assert.deepEqual(plan.writes, [
        { id: "empty", data: { firstName: "sonia" } },
        { id: "whitespace", data: { firstName: "prince" } },
    ]);
    assert.deepEqual(plan.skipped, []);
    assert.deepEqual(plan.counts, { scanned: 2, changed: 2, skipped: 0, invalid: 0 });
});

test("an empty firstName with no username is reported, never skipped or invented", () => {
    const plan = planUserProfileNameBackfill([
        { id: "no-username", data: { firstName: "", lastName: "" } },
        { id: "blank-username", data: { username: "   ", firstName: "" } },
    ]);

    assert.deepEqual(plan.writes, []);
    assert.deepEqual(plan.skipped, []);
    assert.deepEqual(plan.invalid, [
        { id: "no-username", reason: "missing username for firstName backfill" },
        { id: "blank-username", reason: "missing username for firstName backfill" },
    ]);
});

// Writing a value over the cap swaps one blocked profile for another, and
// truncating writes a mangled name nobody would know to correct.
test("backfill refuses to write a username longer than the rules allow", () => {
    const username = "x".repeat(81);
    const plan = planUserProfileNameBackfill([{ id: "long", data: { username, lastName: "" } }]);

    assert.deepEqual(plan.writes, []);
    assert.deepEqual(plan.invalid, [
        { id: "long", reason: "username is 81 characters; firstName is capped at 80" },
    ]);
});

test("backfill writes a username sitting exactly on the 80 character cap", () => {
    const username = "x".repeat(80);
    const plan = planUserProfileNameBackfill([{ id: "at-cap", data: { username, lastName: "" } }]);

    assert.deepEqual(plan.writes, [{ id: "at-cap", data: { firstName: username } }]);
    assert.deepEqual(plan.invalid, []);
});

// An existing name over the cap blocks the closeout batch just as hard as a
// missing one, so it must not hide in the already-valid count.
test("backfill reports existing names that already exceed the cap", () => {
    const plan = planUserProfileNameBackfill([
        { id: "long-first", data: { username: "sonia", firstName: "y".repeat(93), lastName: "" } },
        { id: "long-last", data: { username: "prince", firstName: "Prince", lastName: "z".repeat(84) } },
    ]);

    assert.deepEqual(plan.writes, []);
    assert.deepEqual(plan.skipped, []);
    assert.deepEqual(plan.invalid, [
        { id: "long-first", reason: "firstName is 93 characters; the rules cap it at 80" },
        { id: "long-last", reason: "lastName is 84 characters; the rules cap it at 80" },
    ]);
});

test("backfill normalises a whitespace-only lastName and leaves a real one alone", () => {
    const plan = planUserProfileNameBackfill([
        { id: "blank-last", data: { username: "sonia", firstName: "Sonia", lastName: "  " } },
        { id: "real-last", data: { username: "sonia", firstName: "Sonia", lastName: "Alvarez" } },
        { id: "empty-last", data: { username: "sonia", firstName: "Sonia", lastName: "" } },
    ]);

    assert.deepEqual(plan.writes, [{ id: "blank-last", data: { lastName: "" } }]);
    assert.deepEqual(plan.skipped, ["real-last", "empty-last"]);
});

test("backfill is idempotent: re-planning its own result writes nothing", () => {
    const users = [
        { id: "empty", data: { username: " sonia ", firstName: "", lastName: "" } },
        { id: "absent", data: { username: "Prince" } },
        { id: "fine", data: { username: "login", firstName: "Sonia", lastName: "Alvarez Garcia" } },
    ];

    const plan = planUserProfileNameBackfill(users);
    const applied = users.map((user) => {
        const write = plan.writes.find((candidate) => candidate.id === user.id);
        return { id: user.id, data: { ...user.data, ...(write?.data || {}) } };
    });

    const rerun = planUserProfileNameBackfill(applied);
    assert.deepEqual(rerun.writes, []);
    assert.deepEqual(rerun.invalid, []);
    assert.equal(rerun.counts.skipped, 3);
});
