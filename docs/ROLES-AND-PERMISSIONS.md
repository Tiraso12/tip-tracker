# Roles, Permissions, and Who Sees What

## Role wording has one source

Every human-facing word for a person's ROLE comes from `src/utils/roleLabels.js` - never
re-declare a role map in a component. Each role carries four wordings and you pick by the space
you have: `roleLabel` (full, e.g. "Back Server") where there is room, `roleShortLabel` ("Back")
for chips/pills/phone rows, `rolePluralLabel` ("Backs") for group headings and filters,
`roleInitial` ("B") for roster chip tags. Per the captain, `back` is genuinely two words - "Back
Server" is the name, "Back" the short form - so both must stay reachable.

The file deliberately does NOT own floor-plan SECTION names ("Team 1", "Bar Team", "Runners") or
ledger row labels; those name a place on the floor or a money movement. Watch that boundary:
labelling the bar filter chip with the group name collided with the existing "Bar Team" drop
zone on the same screen.

`ASSIGNABLE_ROLES` is also the canonical SENIORITY order (captain down to runner) and
`roleSeniorityRank` is its only derivation - the Team roster reads in that order, sorted once
where `rosterPeople` is built so the search and every status filter narrow the same ordered
list and cannot drift. Anything not in that list (no role yet, legacy `admin`, an unknown value)
ranks after runner, so those people stay visible in one predictable group rather than vanishing
or landing arbitrarily.

## A job title grants no powers

`users.role` (captain, server, back, assistant, bartender, runner) is what the money is
calculated from and only that; the captain tier comes from a separate per-person switch,
`users.isSupervisor` ("Supervisor" in the captain's words, absent reads as OFF), plus the
manager pointer `restaurant/config.managerUid`. A captain with the switch off is paid as a
captain and has exactly an employee's access.

**Never fold that permission back into the role vocabulary**: `engine.js` reads
`ROLE_POINTS[emp.role]` and matches `emp.role === "captain"` exactly for the captain override,
so a value like `captain-supervisor` reaching a floor plan pays that person zero, silently, and
misses the override - `src/utils/engine.test.js` pins that the switch moves no money. The floor
plan's per-member `teams[].members[].role` is likewise pay weight for one night and NEVER a
permission - any floor-plan editor can change that dropdown, and every predicate reads the
actor's own `users/{uid}` instead.

`src/utils/permissions.js` names every capability once and is the only place a tier is derived;
ask for the capability at a call site, never re-test `role` there. That is why the Team screen's
Approve/Deny controls and the app-bar account badge both read `canApproveAccounts` - a viewer is
never shown a count of work they cannot do, and moving the capability between tiers is one edit.

Only manager authority may move the switch and nobody may move it on their own profile, the
manager included. The tiers (Manager > Captain > Employee, cumulative) stay dormant until a
`restaurant/config` document exists, so in production `role: "admin"` is still the one live
authority - `tests/rules/current-state.test.js` pins that and `tests/rules/manager-tier.test.js`
proves the tiers once a manager is named. **Both authorities are live at once and must stay that
way**: the legacy clause is what makes the cutover safe, and dropping it is a later, irreversible
step. The emulator seed DOES name a manager, so local behaviour is deliberately ahead of
production - `npm run dev:local` prints a login per tier.

The switch's on-screen control is the Supervisor block in the Team roster's person view
(`TeamManagement.jsx`). **Who it may be OFFERED to is a separate question from who it grants
anything to**, and only the offer side may read the job title: `canOfferSupervisor(person)`
(title captain, account active) is the whole gate on that control in BOTH directions - the
Supervisor block renders exactly when the subject is an active captain-titled person who is not
the viewer, and there is no separate stranded state to render. That strands nobody, for two
reasons worth keeping written down: a non-captain supervisor cannot be created, because turning
the switch on is gated the same way and moving somebody off the captain title clears
`isSupervisor` in the SAME write as the role change (said out loud in that confirmation, and
pinned by `tests/e2e/manager-tier.spec.js`); and a deactivated person holds no rights at all,
because `isCaptain` requires `isActive`, so the field is inert while an account is inactive and
reactivating restores the ordinary captain state where the control is back.

The production changeover procedure that makes the manager/captain tiers live -
inventory, the single console write, verification, and how to reverse every part of it - is
[MANAGER-CHANGEOVER.md](MANAGER-CHANGEOVER.md). Run it only when no shift is in progress.

## The manager oversees; they never work a section

The manager takes no share of the pool. The floor-plan pool in `AdminDashboard.jsx` excludes
them **by identity** (`emp.uid !== user.managerUid`), not by job title - today their title
happens to be `admin`, which the legacy `role !== "admin"` filter beside it also catches, but
that value is due to be retired and the pointer is what actually names them. Assigning a manager
would pay them zero silently: `ROLE_POINTS` has no weight for one. Do not "fix" that by giving
the manager a floor role.

## The app has two halves and some people hold both

`src/App.jsx` asks `canOpenShiftWorkspace(user)` for the workspace and `hasOwnPayRecord(user)`
for the pay statement, and they are independent questions: a captain holds both (they run the
night AND are paid from the pool) and **lands on My pay**; the manager holds only the workspace,
because they work no section and take no share. Neither may be a dead end - the crossing is the
bar's home control one way and the account sheet's `Shifts` item the other.

**Home means the VIEWER's home**, so it is today's shifts for the manager and My pay for a
captain; a destination is listed in the account sheet exactly when home does not already lead
there. The captain chose this landing knowing it costs a tap to reach tonight's shift, so do not
"fix" that by making the workspace home again. `tests/e2e/manager-tier.spec.js` (under "THE
COUPLING") pins all of it, and [MANAGER-CHANGEOVER.md](MANAGER-CHANGEOVER.md) says what each
tier meets on screen.
