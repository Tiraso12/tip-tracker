const timestamp = (now) => now || new Date().toISOString();

export function buildShiftSetupDraft({ date, teams, barTeam, runners, now }) {
    const savedAt = timestamp(now);

    return {
        date,
        status: "setup",
        teams,
        barTeam,
        runners,
        setupSavedAt: savedAt,
        updatedAt: savedAt,
    };
}

export function buildClosedShiftPayload({ date, teams, barTeam, runners, payouts, summary, now }) {
    const savedAt = timestamp(now);

    return {
        date,
        status: "closed",
        teams,
        barTeam,
        runners,
        payouts,
        summary,
        closedAt: savedAt,
        updatedAt: savedAt,
    };
}

export function getRemovedPayoutUids(previousPayouts = {}, nextPayouts = {}) {
    return Object.keys(previousPayouts).filter(uid => !(uid in nextPayouts));
}
