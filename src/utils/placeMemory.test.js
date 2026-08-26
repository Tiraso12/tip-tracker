import assert from "node:assert/strict";
import test from "node:test";

import { loadPlace, savePlace } from "./placeMemory.js";

function stubStorage() {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (key) => (store.has(key) ? store.get(key) : null),
            setItem: (key, value) => store.set(key, String(value)),
            removeItem: (key) => store.delete(key),
        },
    };
    return store;
}

test("loadPlace returns null with no uid or no saved entry", () => {
    stubStorage();
    assert.equal(loadPlace(null), null);
    assert.equal(loadPlace("uid-1"), null);
});

test("save then load round-trips a pay/account surface", () => {
    stubStorage();
    savePlace("uid-1", { surface: "pay" });
    assert.deepEqual(loadPlace("uid-1"), { surface: "pay" });

    savePlace("uid-1", { surface: "account" });
    assert.deepEqual(loadPlace("uid-1"), { surface: "account" });
});

test("save then load round-trips a full workspace place", () => {
    stubStorage();
    savePlace("uid-1", {
        surface: "workspace",
        workspace: { tab: "editor", date: "2026-08-26", editorStep: "settle", settleGroupId: "team-2" },
    });
    assert.deepEqual(loadPlace("uid-1"), {
        surface: "workspace",
        workspace: { tab: "editor", date: "2026-08-26", editorStep: "settle", settleGroupId: "team-2" },
    });
});

test("two uids never see each other's place", () => {
    stubStorage();
    savePlace("uid-1", { surface: "workspace", workspace: { tab: "shifts", date: "2026-08-26", editorStep: "floor", settleGroupId: null } });
    savePlace("uid-2", { surface: "pay" });
    assert.equal(loadPlace("uid-1").surface, "workspace");
    assert.equal(loadPlace("uid-2").surface, "pay");
});

test("an invalid surface is treated as nothing saved", () => {
    const store = stubStorage();
    store.set("tip-tracker:place:uid-1", JSON.stringify({ surface: "nonsense" }));
    assert.equal(loadPlace("uid-1"), null);
});

test("garbage JSON is treated as nothing saved", () => {
    const store = stubStorage();
    store.set("tip-tracker:place:uid-1", "{not json");
    assert.equal(loadPlace("uid-1"), null);
});

test("a nonsense workspace date falls back to the shifts landing with no date", () => {
    const store = stubStorage();
    store.set(
        "tip-tracker:place:uid-1",
        JSON.stringify({ surface: "workspace", workspace: { tab: "editor", date: "not-a-date", editorStep: "settle", settleGroupId: "x" } })
    );
    assert.deepEqual(loadPlace("uid-1"), { surface: "workspace" });
});

test("a nonsense workspace tab falls back the same way", () => {
    const store = stubStorage();
    store.set(
        "tip-tracker:place:uid-1",
        JSON.stringify({ surface: "workspace", workspace: { tab: "money", date: "2026-08-26", editorStep: "floor", settleGroupId: null } })
    );
    assert.deepEqual(loadPlace("uid-1"), { surface: "workspace" });
});

test("an out-of-range calendar date (e.g. Feb 30) is rejected", () => {
    const store = stubStorage();
    store.set(
        "tip-tracker:place:uid-1",
        JSON.stringify({ surface: "workspace", workspace: { tab: "shifts", date: "2026-02-30", editorStep: "floor", settleGroupId: null } })
    );
    assert.deepEqual(loadPlace("uid-1"), { surface: "workspace" });
});

test("an invalid editorStep and non-string settleGroupId are coerced to safe defaults", () => {
    const store = stubStorage();
    store.set(
        "tip-tracker:place:uid-1",
        JSON.stringify({ surface: "workspace", workspace: { tab: "editor", date: "2026-08-26", editorStep: "nonsense", settleGroupId: 42 } })
    );
    assert.deepEqual(loadPlace("uid-1"), {
        surface: "workspace",
        workspace: { tab: "editor", date: "2026-08-26", editorStep: "floor", settleGroupId: null },
    });
});
