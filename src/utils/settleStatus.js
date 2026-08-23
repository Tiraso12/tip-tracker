// Settle up "is the money actually in?" status for a switcher group.
//
// The payout pool that funds take-home is Tips (CTP) + Gratuity only - cash is
// distributed separately and Sales/Covers are context, not money in the pool. So
// a green "done" must mean the pool is funded, not merely that Sales was typed:
//   funded      -> pool (tips + gratuity) > 0            -> green, money is in
//   sales-only  -> pool is $0 but Sales/Cash/Covers typed -> amber, not funded yet
//   empty       -> nothing meaningful entered            -> neutral
//
// A group with no assigned people is never "needs money" - it just isn't in play.

export function getGroupMoneyStatus({ pool = 0, hasOtherInput = false, hasPeople = false } = {}) {
    if (!hasPeople) return "empty";
    if (pool > 0) return "funded";
    if (hasOtherInput) return "sales-only";
    return "empty";
}

// Roll up group statuses for the completeness cue near Calculate. Only groups
// that actually have people count toward "still needs money".
export function summarizeGroupStatuses(groups = []) {
    const inPlay = groups.filter((group) => group.hasPeople);
    const funded = inPlay.filter((group) => group.status === "funded").length;
    return {
        total: inPlay.length,
        funded,
        needsMoney: inPlay.length - funded,
    };
}

// Parallel Settle up (2026-08-23, Direction A locked): a dining team or Bar's
// "Save and Mark Done" close-readiness, distinct from the money-in read above.
// `funded`/`sales-only`/`empty` only ever asked "is there money in the pool?" -
// it carried no notion of a captain having said "I'm done adjusting this", which
// a parallel-close model needs to trust one group's numbers as final while
// another is still open. Runners never calls this: it defaults done and stays
// out of the gate entirely (the captain's lock excludes it, unlike Bar).
//   working  -> nothing meaningful entered yet ("still on tables")
//   entering -> money or other input typed, but not yet marked done
//   done     -> markedDone is true - the explicit "Save and Mark Done" action
export function getGroupCloseState({ hasPeople = false, pool = 0, hasOtherInput = false, markedDone = false } = {}) {
    if (!hasPeople) return "empty";
    if (markedDone) return "done";
    if (pool > 0 || hasOtherInput) return "entering";
    return "working";
}

// Plan Q9: editing a group's money after it was marked done silently clears the
// mark, with a quiet on-screen cue rather than a blocking confirm. Pure so the
// "was there actually a mark to clear" question - which decides whether the cue
// fires at all - is answered the same way everywhere a pool/contract field
// changes, instead of re-deriving it at each call site.
export function clearMarkOnEdit(markedDone) {
    if (!markedDone) return { markedDone: false, justCleared: false };
    return { markedDone: false, justCleared: true };
}

// Confirm & Save's per-group gate (plan Q4, narrowed by the captain's
// 2026-08-23 lock): every assigned dining team AND Bar must be marked done.
// Runners is excluded by construction - callers pass it a `kind` of "runners"
// and it is filtered out here rather than trusted to already read as done.
export function summarizeCloseReadiness(groups = []) {
    const gated = groups.filter((group) => group.kind !== "runners" && group.hasPeople);
    const open = gated.filter((group) => !group.markedDone);
    return {
        total: gated.length,
        done: gated.length - open.length,
        stillOpen: open.length,
        openNames: open.map((group) => group.name),
        ready: open.length === 0,
    };
}
