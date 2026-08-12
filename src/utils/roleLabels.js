// One display name per stored role value. Roles are persisted lowercase on the
// user doc; every screen that shows a role to a human reads it from here so the
// wording cannot drift between the team list and the account sheet.
export const ROLE_LABELS = {
    admin: "Admin",
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
    unassigned: "No role yet",
};

export function roleLabel(role) {
    return ROLE_LABELS[role] || role || "No role yet";
}
