// The single source of every human-facing role word. Roles are persisted lowercase
// on the user doc (and on floor-plan members and payout rows); no screen may keep a
// private map, so the wording cannot drift between the team list, the floor plan,
// the account sheet and the exported PDF.
//
// Each role carries four wordings, because the app genuinely needs all four:
//
//   full   - the canonical role name. Use wherever there is room and wherever
//            precision matters: confirmation prompts, payout cards, period
//            summaries, the account sheet.
//   short  - the compact display label for space-constrained surfaces: floor-plan
//            role pills, team setup, phone roster rows, calendar day chips.
//   plural - the name of the group of people in that role, for section headings
//            and role filters.
//   initial- the tightest form of all, for the mobile roster chips on a team card
//            where the tag shares a line with the person's name and point weight.
//
// "Back Server" / "Back" is the reason this shape exists: the captain's decision of
// 2026-08-12 is that both wordings are wanted, the full name where it fits and the
// short one where it would eat the width. Every other role uses the same word for
// full and short unless a shorter form was already in the captain's vocabulary
// (bartender reads "Bar" on a chip); do not invent new abbreviations here.
//
// Boundary: this file owns words that name a PERSON'S ROLE. It deliberately does
// NOT own the floor plan's SECTION names ("Team 1", "Bar Team", "Runners") or the
// ledger row labels - those name a place on the floor or a money movement, sit
// alongside "Team 1", and belong to the captain's floor/money vocabulary instead.
export const ROLES = {
    admin: { full: "Admin", short: "Admin", plural: "Admins", initial: "Ad" },
    captain: { full: "Captain", short: "Captain", plural: "Captains", initial: "C" },
    server: { full: "Server", short: "Server", plural: "Servers", initial: "S" },
    back: { full: "Back Server", short: "Back", plural: "Backs", initial: "B" },
    assistant: { full: "Assistant", short: "Assistant", plural: "Assistants", initial: "A" },
    bartender: { full: "Bartender", short: "Bar", plural: "Bar Team", initial: "Bar" },
    runner: { full: "Runner", short: "Runner", plural: "Runners", initial: "Run" },
    unassigned: { full: "No role yet", short: "No role", plural: "No role yet", initial: "?" },
};

const FALLBACK = ROLES.unassigned;

/** Canonical role name. Use where there is room. */
export function roleLabel(role) {
    return ROLES[role]?.full || FALLBACK.full;
}

/** Compact role label for tight surfaces (chips, pills, phone rows). */
export function roleShortLabel(role) {
    return ROLES[role]?.short || FALLBACK.short;
}

/** Name of the group of people in a role, for headings and filters. */
export function rolePluralLabel(role) {
    return ROLES[role]?.plural || FALLBACK.plural;
}

/** Tightest role tag, for mobile roster chips. Letters where the role carries a
 *  point weight beside it, a short word where it does not. */
export function roleInitial(role) {
    return ROLES[role]?.initial || FALLBACK.initial;
}

// The roles a person can be assigned on the team screen, in the order the
// restaurant reads them. `admin` and `unassigned` are states, not assignments,
// so they carry labels above but are not offered here.
export const ASSIGNABLE_ROLES = ["captain", "server", "back", "assistant", "bartender", "runner"];

// The roles a member can work on a given night's floor plan. Bar and runners are
// assigned to their own sections of the plan rather than picked per member.
export const FLOOR_PLAN_ROLES = ["captain", "server", "back", "assistant"];

// How senior a role reads, derived from ASSIGNABLE_ROLES so the roster's order and
// the job-title picker's order are the SAME list - a second hand-written role order
// would drift from this one. Captain is 0, runner is last.
//
// Anything that is not an assignable role - no role yet, a legacy `admin`, or a
// value this build has never heard of - ranks after runner rather than at an
// arbitrary spot, so those people stay visible in one predictable trailing group
// instead of scattering through the list or dropping out of it.
export function roleSeniorityRank(role) {
    const rank = ASSIGNABLE_ROLES.indexOf(role);
    return rank === -1 ? ASSIGNABLE_ROLES.length : rank;
}
