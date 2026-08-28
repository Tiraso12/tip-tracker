// Day Rail (Flow A) step model.
//
// The admin day is an ordered spine of four moments:
//   ① Floor plan  ② Settle up  ③ Review  ·  Pay out
// Status is always shown and earlier/reachable steps stay one tap away - order
// is never hard-forced. This module is the single source of truth for step
// order, "which step is next", floor-plan-exists detection, and how each rail
// pill renders, so the landing rail and the in-editor rail never drift apart.

export const STEP_ORDER = ["floor", "settle", "review"];

// Not a shift status any save path writes - the day landing synthesises it for a
// date that has payout ledger entries but no shifts/{date} doc behind them. That
// shape only comes from the ledger migration or a write that did not finish, and
// it used to be invisible: with no shift doc the day read as blank, so real
// payroll data sat on the date with no way to reach it. It is deliberately NOT
// "closed" - the day was never settled here, there is nothing to review or edit,
// and the only thing the landing offers is cleanup (or building the shift for
// real). See `getLandingStage`.
export const ORPHANED_PAYOUTS_STATUS = "orphaned-payouts";

export const RAIL_LABELS = {
    floor: "Floor plan",
    settle: "Settle up",
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
    // Leftover ledger entries with no shift: its own stage, so it can never be
    // mistaken for a paid-out day, and so a genuinely blank day (no shift AND no
    // entries) still lands on "build-floor" exactly as before.
    if (shiftStatus === ORPHANED_PAYOUTS_STATUS) return "orphaned-payouts";
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
export function getRailSteps({
    activeStep = null,
    shiftStatus = null,
    reviewReady = false,
    hasFloorStaff = false,
} = {}) {
    const hasFloor = hasFloorPlan(shiftStatus);
    const closed = isClosedShift(shiftStatus);
    const inEditor = Boolean(activeStep);
    const focus = getFocusStep({ activeStep, shiftStatus });

    // Each check reports a FACT, never an inference from where you happen to be
    // standing. Both of these used to be inferred from the open step - floor was "done"
    // whenever you were past it, settle was "done" whenever Review was open - which was
    // safe only while Review was unreachable without pressing Calculate. Now that the
    // rail walks to Review freely, that inference would tick both boxes on a shift with
    // nobody assigned and no money in, which is exactly the false all-clear this rail
    // must not give.
    const floorDone = hasFloor || hasFloorStaff;
    const settleDone = reviewReady || closed;
    const reviewDone = closed;

    // On the closed-day landing every pill is "done"; the day is finished and the
    // review lives in the payout panel below (Edit shift is a header action on
    // Pay out), so the identical checks must all read as inert rather than have
    // one silently navigate. In the editor the steps stay reachable as before.
    const closedLanding = closed && !inEditor;

    const stateFor = (key, done) => (focus === key ? "active" : done ? "done" : "pending");

    // The rail is Floor -> Settle -> Review; Review is the final step where Confirm
    // & Save happens. (The old "Pay out" pill was vestigial - it only exited the
    // editor to the landing, which the side nav / save flows already do; the saved
    // payout summary is reached after Confirm & Save, not through a rail step.)
    //
    // Inside the editor Review is a DESTINATION, not a reward: it is always one tap
    // away, exactly like Floor and Settle. Review derives its numbers from the live
    // floor plan and money on every render, so there is nothing to "unlock" and no
    // detour back through Settle up to press a Calculate button. When the inputs are
    // too incomplete to compute, Review says so on its own screen rather than being
    // silently unreachable from here. The landing rail has no Review destination
    // (it opens the editor at Floor or Settle), so the pill stays inert there.
    const reviewReachable = inEditor;

    return [
        { key: "floor", index: 1, label: RAIL_LABELS.floor, state: stateFor("floor", floorDone), clickable: !closedLanding },
        { key: "settle", index: 2, label: RAIL_LABELS.settle, state: stateFor("settle", settleDone), clickable: !closedLanding && (floorDone || activeStep === "settle") },
        { key: "review", index: 3, label: RAIL_LABELS.review, state: stateFor("review", reviewDone), clickable: reviewReachable },
    ];
}
