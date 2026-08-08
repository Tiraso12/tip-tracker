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
