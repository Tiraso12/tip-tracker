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
