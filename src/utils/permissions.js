// Who may do what.
//
// Every capability in the app is named here once, and call sites ask for the
// capability rather than re-deriving it from a role string. "Can this person
// approve people?" is answered in a single place, so moving a capability
// between tiers is one edit here and every consumer follows.
//
// The tiers are cumulative - Manager > Captain > Employee:
//
//   Manager   exactly one person. Approves and denies accounts, assigns roles,
//             deactivates people, merges temporary profiles, removes a settled
//             day, and hands the tier on. Does not work a section and is not
//             paid from the pool.
//   Captain   everyone the manager has given the "Supervisor" switch to. Enters
//             money at settle-up, builds and edits the floor plan, adds
//             temporary staff mid-setup, corrects an already-settled day, and
//             reads the whole roster and colleagues' pay history.
//   Employee  everyone else. Reads their own pay and nothing more.
//
// A JOB TITLE GRANTS NOTHING. users.role - captain, server, back, assistant,
// bartender, runner - is the title the money is calculated from, and only that.
// A captain with the Supervisor switch off is paid exactly as a captain and has
// exactly an employee's access; a trusted server can hold the switch without
// inventing a title for it.
//
// SAFETY RULE, do not weaken: permission is bound to the SUPERVISOR switch on
// users/{uid} plus the manager pointer, and to nothing else.
//   - Never fold the switch back into the role vocabulary. engine.js reads
//     ROLE_POINTS[emp.role] and matches emp.role === "captain" exactly for the
//     captain override, so a role value like "captain-supervisor" would reach a
//     floor plan and pay that person zero, silently. It is a separate field for
//     that reason and the pay maths must never learn of it.
//   - The floor plan's per-member "worked as" role is pay weight for one night
//     and grants nothing - any floor-plan editor can change that dropdown, so
//     reading it here would let a supervisor promote themselves. The same goes
//     for any other key on a floor-plan member.
// firestore.rules holds both lines on the server.
//
// MIGRATION STATE: the tier model is dormant until the restaurant names a
// manager. With no manager pointer, `role: "admin"` is still the only authority
// and every capability below resolves exactly as it did before the tiers
// existed. Naming the manager is the cutover, and it is a separate release.

const isActive = (user) => user?.status === "active";

// The tiers go live only once a manager has been named. AuthContext resolves
// the pointer from restaurant/config at sign-in.
const tierModelActive = (user) => Boolean(user?.managerUid);

// Exactly one manager, named by the pointer. A role value can neither grant the
// manager tier nor be mistaken for it.
const isManager = (user) =>
    tierModelActive(user) && user.managerUid === user?.uid && isActive(user);

// The Supervisor switch, set per person by the manager. Absent reads as OFF, so
// nobody holds the tier until a manager deliberately turns it on. Strictly
// `true`: a stray string or number in the field is not a grant.
const isSupervisor = (user) => user?.isSupervisor === true;

// The manager needs no switch of their own - the pointer already carries every
// captain power.
const isCaptain = (user) =>
    isManager(user) || (tierModelActive(user) && isSupervisor(user) && isActive(user));

// Legacy authority. Today's `role: "admin"` account keeps exactly the access it
// has now; the cutover retires it. Do not drop this before then.
const isLegacyAdmin = (user) => user?.role === "admin" && isActive(user);

const hasManagerAccess = (user) => isManager(user) || isLegacyAdmin(user);
const hasCaptainAccess = (user) => isCaptain(user) || isLegacyAdmin(user);

// --- Manager ---------------------------------------------------------------

// Act on a pending sign-up.
export function canApproveAccounts(user) {
    return hasManagerAccess(user);
}

// Set or change a person's job title - and with it their default point weight.
// This moves money, not access.
export function canAssignRoles(user) {
    return hasManagerAccess(user);
}

// Turn a person's "Supervisor" switch on or off. This is the
// privilege-escalation control: the switch IS the captain tier. firestore.rules
// additionally refuses a self-write from anyone, the manager included, so the
// tier can only ever be handed to someone else.
export function canSetSupervisor(user) {
    return hasManagerAccess(user);
}

// Deactivate or reactivate an employee.
export function canDeactivateAccounts(user) {
    return hasManagerAccess(user);
}

// Merge a temporary staff profile into a real account, which deletes the
// temporary profile.
export function canMergeTempStaff(user) {
    return hasManagerAccess(user);
}

// Hard-delete a settled date and the payout ledger with it. Distinct from
// correcting one - see canCorrectSettledDay.
export function canRemoveSettledDay(user) {
    return hasManagerAccess(user);
}

// Hand the manager tier to someone else. One atomic write, so there is never a
// moment with zero or two managers.
export function canTransferManagerTier(user) {
    return hasManagerAccess(user);
}

// --- Captain ---------------------------------------------------------------

// Reach the shift workspace at all.
export function canOpenShiftWorkspace(user) {
    return hasCaptainAccess(user);
}

// Build and edit a night's floor plan.
export function canBuildFloorPlan(user) {
    return hasCaptainAccess(user);
}

// Add a temporary staff profile mid-setup.
export function canAddTempStaff(user) {
    return hasCaptainAccess(user);
}

// Enter money and confirm a night's payouts.
export function canSettleUp(user) {
    return hasCaptainAccess(user);
}

// Reopen an already-settled day and correct it. A captain who made a mistake
// fixes it themself; removing the day outright is the manager's.
export function canCorrectSettledDay(user) {
    return hasCaptainAccess(user);
}

// Read the whole roster, not only tonight's floor.
export function canReadRoster(user) {
    return hasCaptainAccess(user);
}

// Read a colleague's pay history, the way an employee asks their captain.
export function canReadColleaguePay(user) {
    return hasCaptainAccess(user);
}
