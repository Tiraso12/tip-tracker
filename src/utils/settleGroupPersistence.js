// Parallel Settle up (2026-08-23, Direction A locked): a live per-group draft,
// one Firestore doc per dining team, written only by whoever is actively
// editing that group. This is what makes "writes scoped to the group being
// edited" possible for `teams` even though it is stored as an ARRAY on the
// shift doc - Firestore has no dotted-path update into a specific array
// element, only into a map's own keys. Bar needs no subcollection doc of its
// own: `barTeam` is already a single map field on the shift doc, so its
// scoped write is a plain dotted-path `updateDoc` straight onto it.
//
// Only a team's money (pools/contracts) and its close-readiness mark live
// here - a team's roster (`members`) stays on the whole-document Floor plan
// autosave (ShiftEditorPanel.jsx), a different, largely single-editor surface
// this feature does not touch. These docs are only ever read or written while
// a shift is unsettled ("setup"); once Confirm & Save closes it, nothing
// reads them again - a reopened closed shift saves only through Confirm &
// Save, exactly as it did before this feature (ShiftEditorPanel.jsx's
// existing "autosave is off once closed" rule is untouched).

export const SETTLE_GROUP_COLLECTION = "settleGroups";

// A dining team's scoped draft doc payload - the whole doc, always a full
// replace. It holds nothing else, so there is no partial-merge case to get
// wrong the way there would be on the shared main shift document.
export function buildTeamGroupDraft({ pools = {}, contracts = [], markedDone = false, now, updatedBy = null }) {
    return {
        pools,
        contracts,
        markedDone,
        updatedAt: now,
        updatedBy,
    };
}

// Dotted-path patch for Bar's scoped write straight onto the shift doc -
// touches only `barTeam.pools` / `barTeam.markedDone` and their own
// bookkeeping timestamp, never `barTeam.members` (Floor plan's field) or any
// other group's data. Namespaced under `settleUpdatedAt/By` rather than the
// shift doc's own top-level `updatedAt`/`updatedBy`, which the whole-document
// Floor autosave still owns.
export function buildBarGroupPatch({ pools = {}, markedDone = false, now, updatedBy = null }) {
    return {
        "barTeam.pools": pools,
        "barTeam.markedDone": markedDone,
        "barTeam.settleUpdatedAt": now,
        "barTeam.settleUpdatedBy": updatedBy,
    };
}

// Apply an incoming settleGroups/{teamId} draft onto the in-memory teams
// array, by id - the read-side mirror of buildTeamGroupDraft. Pure so the
// live-subscription merge in ShiftEditorPanel stays testable without a
// Firestore listener.
export function applyTeamGroupPatch(teams = [], teamId, patch = {}) {
    return teams.map((team) => (team.teamId === teamId ? { ...team, ...patch } : team));
}

// Plan Q1's accepted concurrency rule, made explicit and testable: a group's
// local state is only overwritten by a live remote update while nobody is
// actively typing into it. Settle up shows exactly one group at a time (the
// tab strip), so "actively typing" is exactly "is the selected tab" - every
// other group is safe to keep live-fresh from whoever else is editing it.
export function shouldAcceptRemoteGroupUpdate(groupId, activeGroupId) {
    return groupId !== activeGroupId;
}
