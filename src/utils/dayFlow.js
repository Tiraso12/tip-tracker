// Day Rail (Flow A) step model.
//
// The admin day is an ordered spine of four moments:
//   ① Floor plan  ② Settle up  ③ Review  ·  Pay out
// Status is always shown and earlier/reachable steps stay one tap away - order
// is never hard-forced. This module is the single source of truth for step
// order, "which step is next", floor-plan-exists detection, and how each rail
// pill renders, so the landing rail and the in-editor rail never drift apart.

export const STEP_ORDER = ["floor", "settle", "review"];

export const RAIL_LABELS = {
    floor: "Floor",
    settle: "Settle",
    review: "Review",
    payout: "Pay out",
};

// A saved shift doc's status implies the floor plan already exists: "setup"
// means the lineup was saved (money not yet settled); "closed" means paid out.
export function hasFloorPlan(shiftStatus) {
    return shiftStatus === "setup" || shiftStatus === "closed";
}

export function isClosedShift(shiftStatus) {
    return shiftStatus === "closed";
}

// The next step after the given one, or null at the end of the spine.
export function getNextStep(step) {
    const i = STEP_ORDER.indexOf(step);
    return i === -1 || i === STEP_ORDER.length - 1 ? null : STEP_ORDER[i + 1];
}

// Where a returning admin should resume for a day with the given status:
// no floor plan -> build it; floor saved but not paid out -> settle up;
// closed -> the day is done (pay out review). Drives the landing CTA.
export function getLandingStage(shiftStatus) {
    if (!hasFloorPlan(shiftStatus)) return "build-floor";
    if (!isClosedShift(shiftStatus)) return "settle";
    return "closed";
}

// The step the rail should highlight as "active". Inside the editor that is the
// open step; on the landing (no open step) it is the first incomplete step.
export function getFocusStep({ activeStep = null, shiftStatus = null }) {
    if (activeStep) return activeStep;
    if (!hasFloorPlan(shiftStatus)) return "floor";
    if (!isClosedShift(shiftStatus)) return "settle";
    return null; // closed: nothing left to do
}

// Build the four rail pills with per-step status + reachability. Used by both
// the landing rail (activeStep omitted) and the in-editor rail (activeStep set).
export function getRailSteps({ activeStep = null, shiftStatus = null, hasCalculatedReview = false } = {}) {
    const hasFloor = hasFloorPlan(shiftStatus);
    const closed = isClosedShift(shiftStatus);
    const inEditor = Boolean(activeStep);
    const focus = getFocusStep({ activeStep, shiftStatus });

    const floorDone = hasFloor || (inEditor && activeStep !== "floor");
    const settleDone = hasCalculatedReview || closed || activeStep === "review";
    const reviewDone = closed;

    const stateFor = (key, done) => (focus === key ? "active" : done ? "done" : "pending");

    return [
        { key: "floor", index: 1, label: RAIL_LABELS.floor, state: stateFor("floor", floorDone), clickable: true },
        { key: "settle", index: 2, label: RAIL_LABELS.settle, state: stateFor("settle", settleDone), clickable: floorDone || activeStep === "settle" },
        { key: "review", index: 3, label: RAIL_LABELS.review, state: stateFor("review", reviewDone), clickable: hasCalculatedReview },
        { key: "payout", index: 4, label: RAIL_LABELS.payout, state: reviewDone ? "done" : "end", clickable: inEditor },
    ];
}
