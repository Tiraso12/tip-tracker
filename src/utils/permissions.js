// Who may act on a pending sign-up.
//
// This is the ONE definition of the approve-accounts capability. The Approve /
// Deny controls on the Team screen and the app bar's pending-approvals count
// both read it, so "can this person approve people?" is answered in a single
// place instead of being re-derived from a role string at each call site.
//
// Today it resolves to an active admin - the same condition that opens the admin
// workspace at all, which is what has always guarded the approve action. When
// the Manager tier lands and approving accounts moves to managers, repoint this
// function and every consumer follows. Do not test `role` at a call site.
export function canApproveAccounts(user) {
    return user?.role === "admin" && user?.status === "active";
}
