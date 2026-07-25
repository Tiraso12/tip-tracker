export function getMergeHistoryState(user = {}) {
    const hasTipFlag = typeof user.hasTipHistory === "boolean";
    const hasShiftFlag = typeof user.hasShiftHistory === "boolean";

    if (!hasTipFlag || !hasShiftFlag) {
        return { hasHistory: false, needsFallbackScan: true };
    }

    return {
        hasHistory: user.hasTipHistory || user.hasShiftHistory,
        needsFallbackScan: false,
    };
}

export function getShiftParticipantUids({ teams = [], barTeam = {}, runners = [], payouts = {} } = {}) {
    const uids = new Set();
    const addUid = (uid) => {
        if (uid) uids.add(uid);
    };

    teams.forEach(team => {
        (team.members || []).forEach(member => addUid(member.uid));
    });
    (barTeam.members || []).forEach(member => addUid(member.uid));
    runners.forEach(member => addUid(member.uid));
    Object.keys(payouts || {}).forEach(addUid);

    return Array.from(uids);
}

export function getHistoryFlagUpdate(status) {
    if (status === "closed") {
        return { hasShiftHistory: true, hasTipHistory: true };
    }

    return { hasShiftHistory: true };
}
