import assert from "node:assert/strict";
import test from "node:test";

import { loadPlace, savePlace, canPersistSurface } from "./placeMemory.js";

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

test("canPersistSurface refuses to save before restore has run for this uid", () => {
    assert.equal(canPersistSurface({ uid: "uid-1", restoredUid: null }), false);
    assert.equal(canPersistSurface({ uid: "uid-1", restoredUid: "uid-2" }), false);
    assert.equal(canPersistSurface({ uid: null, restoredUid: "uid-1" }), false);
    assert.equal(canPersistSurface({ uid: "uid-1", restoredUid: "uid-1" }), true);
});

// Regression for the reload-lands-on-My-pay bug the captain reported: App.jsx
// has two effects that both depend on user.uid - restore (reads the saved
// place, calls setSurface) and save (persists the current surface). Both
// fire in the SAME commit the instant uid first becomes set. This models
// that commit sequence directly against the real functions, without a React
// test harness, gated the way canPersistSurface is meant to be used.
test("restore-then-save in the same commit never clobbers the just-restored surface", () => {
    stubStorage();
    savePlace("uid-1", { surface: "workspace" });

    // Commit 1: uid just became "uid-1". Component state before this commit's
    // effects run: surface="pay" (the pre-login default), restoredUid=null.
    let surface = "pay";
    let restoredUid = null;

    // Restore effect runs first (declared first in App.jsx): decides the
    // real surface and marks this uid as restored - but neither has
    // reached a render yet, so `surface` in this commit is still "pay".
    const place = loadPlace("uid-1");
    const restoredSurface = place?.surface === "workspace" ? "workspace" : "pay";
    const nextRestoredUid = "uid-1";

    // Save effect runs next, in the SAME commit, seeing the OLD surface/
    // restoredUid closure values (React hasn't re-rendered between them).
    if (canPersistSurface({ uid: "uid-1", restoredUid }) && surface !== "workspace") {
        savePlace("uid-1", { surface });
    }
    // Without the guard this would already have written {surface:"pay"},
    // clobbering the workspace note - assert it did NOT happen.
    assert.deepEqual(loadPlace("uid-1"), { surface: "workspace" });

    // Commit 2: the scheduled state updates land, so this render's closures
    // now see the restored values.
    surface = restoredSurface;
    restoredUid = nextRestoredUid;
    if (canPersistSurface({ uid: "uid-1", restoredUid }) && surface !== "workspace") {
        savePlace("uid-1", { surface });
    }
    // surface === "workspace" here, so save still correctly no-ops (that
    // surface is AdminDashboard's to persist) and the note survives intact.
    assert.deepEqual(loadPlace("uid-1"), { surface: "workspace" });
});
