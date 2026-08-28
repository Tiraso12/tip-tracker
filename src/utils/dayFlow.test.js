import assert from "node:assert/strict";
import test from "node:test";

import {
    STEP_ORDER,
    ORPHANED_PAYOUTS_STATUS,
    hasFloorPlan,
    isClosedShift,
    getNextStep,
    getLandingStage,
    getFocusStep,
    getRailSteps,
} from "./dayFlow.js";

const stateByKey = (steps) => Object.fromEntries(steps.map((s) => [s.key, s.state]));
const clickableByKey = (steps) => Object.fromEntries(steps.map((s) => [s.key, s.clickable]));

test("floor-plan-exists detection follows the shift status", () => {
    assert.equal(hasFloorPlan(null), false);
    assert.equal(hasFloorPlan("setup"), true);
    assert.equal(hasFloorPlan("closed"), true);
    assert.equal(isClosedShift("setup"), false);
    assert.equal(isClosedShift("closed"), true);
});

test("getNextStep walks the spine and stops at the end", () => {
    assert.equal(getNextStep("floor"), "settle");
    assert.equal(getNextStep("settle"), "review");
    assert.equal(getNextStep("review"), null);
    assert.equal(getNextStep("payout"), null);
    assert.equal(getNextStep("bogus"), null);
    assert.deepEqual(STEP_ORDER, ["floor", "settle", "review"]);
});

test("getLandingStage resumes the returning admin at the right step", () => {
    assert.equal(getLandingStage(null), "build-floor");
    assert.equal(getLandingStage("setup"), "settle");
    assert.equal(getLandingStage("closed"), "closed");
});

// Payout ledger entries with no shifts/{date} doc behind them (the ledger
// migration's shape, or a write that did not finish). They are real payroll data,
// so the day must be reachable and removable - but on its own stage, never dressed
// as a paid-out shift, and never at the cost of a genuinely blank day.
test("a date holding only orphaned payout entries gets its own landing stage", () => {
    assert.equal(getLandingStage(ORPHANED_PAYOUTS_STATUS), "orphaned-payouts");
    // Not a shift: nothing was built and nothing was settled here.
    assert.equal(hasFloorPlan(ORPHANED_PAYOUTS_STATUS), false);
    assert.equal(isClosedShift(ORPHANED_PAYOUTS_STATUS), false);
    // A day with no shift AND no entries is untouched by this - still blank.
    assert.equal(getLandingStage(null), "build-floor");
});

// The rail is the fresh-day rail: the floor plan really can still be built here,
// which is the other honest way to resolve the leftovers.
test("the orphaned-payouts rail still opens the Floor plan and locks the rest", () => {
    const steps = getRailSteps({ shiftStatus: ORPHANED_PAYOUTS_STATUS });

    assert.deepEqual(stateByKey(steps), {
        floor: "active",
        settle: "pending",
        review: "pending",
    });
    assert.deepEqual(clickableByKey(steps), {
        floor: true,
        settle: false,
        review: false,
    });
});

test("focus step is the open step in-editor, else the first incomplete step", () => {
    // In the editor, the open step is the focus regardless of status.
    assert.equal(getFocusStep({ activeStep: "settle", shiftStatus: "setup" }), "settle");
    // On the landing (no open step) it is the first incomplete step.
    assert.equal(getFocusStep({ shiftStatus: null }), "floor");
    assert.equal(getFocusStep({ shiftStatus: "setup" }), "settle");
    assert.equal(getFocusStep({ shiftStatus: "closed" }), null);
});

test("landing rail on a fresh day highlights Floor and locks later steps", () => {
    const steps = getRailSteps({ shiftStatus: null });
    assert.deepEqual(stateByKey(steps), {
        floor: "active",
        settle: "pending",
        review: "pending",
    });
    // Nothing past the floor is reachable yet.
    assert.deepEqual(clickableByKey(steps), {
        floor: true,
        settle: false,
        review: false,
    });
});

test("landing rail on a setup day marks Floor done and opens Settle", () => {
    const steps = getRailSteps({ shiftStatus: "setup" });
    assert.deepEqual(stateByKey(steps), {
        floor: "done",
        settle: "active",
        review: "pending",
    });
    assert.equal(steps.find((s) => s.key === "settle").clickable, true);
});

test("landing rail on a closed day shows every step done", () => {
    const steps = getRailSteps({ shiftStatus: "closed" });
    assert.deepEqual(stateByKey(steps), {
        floor: "done",
        settle: "done",
        review: "done",
    });
    // The day is finished and the review lives in the payout panel below, so all
    // three identical "done" checks must read as inert rather than silently navigate
    // (mismatched affordance fix).
    assert.deepEqual(clickableByKey(steps), {
        floor: false,
        settle: false,
        review: false,
    });
});

test("in-editor rail at Floor: later steps pending until floor is saved", () => {
    const steps = getRailSteps({ activeStep: "floor", shiftStatus: null });
    assert.equal(steps.find((s) => s.key === "floor").state, "active");
    assert.equal(steps.find((s) => s.key === "settle").state, "pending");
    assert.equal(steps.find((s) => s.key === "settle").clickable, false);
    // The rail ends at Review now; there is no "Pay out" pill.
    assert.equal(steps.find((s) => s.key === "payout"), undefined);
    assert.equal(steps.length, 3);
});

test("in-editor rail at Settle marks Floor done and Settle reachable back", () => {
    const steps = getRailSteps({ activeStep: "settle", shiftStatus: "setup" });
    assert.equal(steps.find((s) => s.key === "floor").state, "done");
    assert.equal(steps.find((s) => s.key === "floor").clickable, true);
    assert.equal(steps.find((s) => s.key === "settle").state, "active");
    // Review is a destination like any other step, not a reward for pressing a button.
    assert.equal(steps.find((s) => s.key === "review").clickable, true);
});

test("Settle reads done once the live inputs produce a payout calculation", () => {
    const steps = getRailSteps({ activeStep: "review", shiftStatus: "setup", reviewReady: true });
    assert.equal(steps.find((s) => s.key === "settle").state, "done");
    assert.equal(steps.find((s) => s.key === "review").state, "active");
    assert.equal(steps.find((s) => s.key === "review").clickable, true);
});

test("editing a closed shift shows floor/settle/review done but still navigable", () => {
    const steps = getRailSteps({ activeStep: "floor", shiftStatus: "closed" });
    assert.equal(steps.find((s) => s.key === "floor").state, "active"); // open step
    assert.equal(steps.find((s) => s.key === "settle").state, "done");
    assert.equal(steps.find((s) => s.key === "settle").clickable, true);
    assert.equal(steps.find((s) => s.key === "review").state, "done");
});

// A saved shift already has payouts, so Review must not dead-end behind a detour
// through Settle up.
test("editing a closed shift can open Review directly", () => {
    const steps = getRailSteps({ activeStep: "floor", shiftStatus: "closed", reviewReady: false });

    assert.equal(steps.find((s) => s.key === "review").clickable, true);
});

// The closed-day landing stays inert: its pills are status, not navigation - Pay
// out's header has the "Edit shift" action.
test("the closed-day landing rail keeps Review unclickable", () => {
    const steps = getRailSteps({ shiftStatus: "closed" });

    assert.equal(steps.find((s) => s.key === "review").clickable, false);
});

// THE round trip the captain hit: Review -> Floor plan -> add a member -> Review, with
// no calculation in hand and no walk back through Settle up. Adding someone on the floor
// used to make Review unreachable; the rail must keep it one tap away.
test("Review stays reachable from the Floor plan on a setup shift with no calculation", () => {
    const steps = getRailSteps({ activeStep: "floor", shiftStatus: "setup", reviewReady: false });

    assert.equal(steps.find((s) => s.key === "review").clickable, true);
});

// The landing rail has no Review destination - tapping a step there opens the editor at
// Floor or Settle - so the pill must not look tappable before the editor is open.
test("the setup-day landing rail keeps Review unclickable", () => {
    const steps = getRailSteps({ shiftStatus: "setup" });

    assert.equal(steps.find((s) => s.key === "review").clickable, false);
});

// Opening Review is navigation, not progress. The rail must not tick Floor and Settle
// as done just because Review is the open step - on an empty shift that would be a
// false all-clear on the two things that are actually still missing.
test("standing on Review does not mark Floor or Settle done on an empty shift", () => {
    const steps = getRailSteps({
        activeStep: "review",
        shiftStatus: null,
        reviewReady: false,
        hasFloorStaff: false,
    });

    assert.notEqual(steps.find((s) => s.key === "floor").state, "done");
    assert.notEqual(steps.find((s) => s.key === "settle").state, "done");
});

// Staff assigned in the editor but not yet saved still counts as a floor plan for the
// rail - the check reports what is on screen, not what has reached Firestore.
test("unsaved staff assigned in the editor marks Floor done", () => {
    const steps = getRailSteps({
        activeStep: "review",
        shiftStatus: null,
        reviewReady: false,
        hasFloorStaff: true,
    });

    assert.equal(steps.find((s) => s.key === "floor").state, "done");
    assert.notEqual(steps.find((s) => s.key === "settle").state, "done");
});
