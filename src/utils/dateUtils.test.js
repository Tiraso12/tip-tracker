import test from "node:test";
import assert from "node:assert/strict";
import { toDateKey } from "./dateUtils.js";

test("formats local calendar dates as stable date keys", () => {
    assert.equal(toDateKey(new Date(2026, 5, 1, 23, 59)), "2026-06-01");
    assert.equal(toDateKey(new Date(2026, 0, 5, 0, 1)), "2026-01-05");
});
