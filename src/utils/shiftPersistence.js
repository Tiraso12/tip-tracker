const timestamp = (now) => now || new Date().toISOString();

export function buildShiftSetupDraft({ date, teams, barTeam, runners, now, includeCloseoutDraft = false }) {
    const savedAt = timestamp(now);

    const payload = {
        date,
        status: "setup",
        teams,
        barTeam,
        runners,
        setupSavedAt: savedAt,
        updatedAt: savedAt,
    };

    if (includeCloseoutDraft) {
        payload.closeoutDraftSavedAt = savedAt;
    }

    return payload;
}

export function stripPayoutsFromSummary(summary) {
    if (!summary) return summary;
    const { payouts: _PAYOUTS, ...summaryWithoutPayouts } = summary;
    return summaryWithoutPayouts;
}

export function buildClosedShiftPayload({
    date,
    teams,
    barTeam,
    runners,
    summary,
    now,
    existingShift = null,
    operationId = null,
    updatedBy = null,
}) {
    const savedAt = timestamp(now);
    const firstClosedAt = existingShift?.firstClosedAt || existingShift?.closedAt || savedAt;

    return {
        date,
        status: "closed",
        teams,
        barTeam,
        runners,
        summary: stripPayoutsFromSummary(summary),
        firstClosedAt,
        closedAt: firstClosedAt,
        lastRecalculatedAt: savedAt,
        updatedAt: savedAt,
        updatedBy,
        operationId,
    };
}

export function getRemovedPayoutUids(previousPayouts = {}, nextPayouts = {}) {
    return Object.keys(previousPayouts).filter(uid => !(uid in nextPayouts));
}
