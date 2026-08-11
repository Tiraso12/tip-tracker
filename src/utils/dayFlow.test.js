import assert from "node:assert/strict";
import test from "node:test";

import {
    STEP_ORDER,
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
    // Review is not reachable until payouts are calculated.
    assert.equal(steps.find((s) => s.key === "review").clickable, false);
});

test("Review becomes reachable and Settle reads done once payouts are calculated", () => {
    const steps = getRailSteps({ activeStep: "review", shiftStatus: "setup", hasCalculatedReview: true });
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
