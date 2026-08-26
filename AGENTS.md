# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge. It is kept lean
and always-loaded; the hard-won detail behind these rules lives in `docs/` and is linked from
here rather than copied. Add durable project-specific notes here as they are discovered through
real work - see "Maintaining this file" at the bottom for where and how.

## Agent skills

This repo is on Path B (brownfield, incremental) of [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) -
Phase 1 only (context and read-only skills; no TDD/spec/plan/ship skills yet). The skills live at
`.agents/skills/<name>/SKILL.md` - read one directly when it applies (`.claude/` is gitignored
here, so nothing is auto-discovered; load by path). Start with `using-agent-skills` to route to
the right one; `context-engineering` describes what belongs in this file; `code-review-and-quality`
and `debugging-and-error-recovery` apply to routine review/bugfix work; `doubt-driven-development`
is the adversarial check for unfamiliar-code claims or high-stakes changes.

## Tech Stack

- React 19, Vite 7, Tailwind CSS v4 (design tokens as CSS custom properties, `@theme` in `src/styles/`)
- Firebase: Firestore (data), Authentication, Hosting
- jsPDF + jsPDF-AutoTable for payout/pay-statement PDFs
- Node.js 20+

Full table: [README.md § Tech Stack](README.md#tech-stack).

## Commands

Local development and validation are emulator-first. **`docs/TESTING.md` is authoritative** for
the Mac setup, the `npm run dev:local` loop, the `npm run test:all` gate, and the `main`
branch model - read it rather than trusting a summary here.

- `npm run dev:local` - one-command local loop against seeded Firebase emulators
- `npm test` - unit tests (`src/**/*.test.js`, no emulator, no browser)
- `npm run test:rules` - Firestore security rules tests, against the emulator
- `npm run test:e2e` - Playwright, against the emulators
- `npm run test:all` - the full local pre-merge gate (chains all of the above plus lint and build)
- `npm run lint` / `npm run build`

## Code Conventions

- Functional components with hooks only - no class components.
- `src/utils/*.js` uses named exports only, never a default export - match that when adding a
  util. Component and service export style is not uniform (most top-level screens use
  `export default`, but `src/components/Admin/ShiftEditor/*.jsx` and `src/services/dataService.js`
  do not) - match the neighboring file rather than assuming a rule.
- Tests are colocated next to the code they cover (`foo.js` → `foo.test.js`), written with
  `node:test` and `node:assert/strict` - no external unit test framework.
- Colors and radii come from CSS custom properties defined in `src/styles/` (`var(--color-ink)`,
  `var(--radius-md)`, etc.), not raw Tailwind palette classes - the app's design tokens are the
  Pullenberg kit's, and a hardcoded color drifts from them silently. See
  [docs/UI-CONVENTIONS.md](docs/UI-CONVENTIONS.md) for where the kit overrides this app's older
  defaults (e.g. tap-target size).
- **Code says WHAT, docs say WHY.** A comment earns its place by explaining the mechanism it sits
  next to. A document earns its place by carrying the reasons, decisions and trade-offs the code
  cannot show: why this shape, why not the obvious alternative, what breaks if you change it. A
  doc that restates mechanics the code already shows is the failure mode - move that knowledge
  into a comment at the place it applies, or drop it. Prefer a pointer to the authoritative file
  over a copy of what it says.
- Speak the captain's vocabulary in UI copy, comments, and commit messages: **CTP** = charged tip,
  **GRT** = gratuity, **Floor plan** / **Settle up** / **Review** are the day's steps
  (`src/utils/dayFlow.js` is the authority on the rail). Renaming any of these costs the captain
  their scanning habits. Full money model: [docs/MONEY-MODEL.md](docs/MONEY-MODEL.md).
- Every human-facing role word comes from `src/utils/roleLabels.js`; every permission check comes
  from `src/utils/permissions.js`. Never re-declare a role map, and never re-test `role` at a call
  site - ask for the named capability instead. Details:
  [docs/ROLES-AND-PERMISSIONS.md](docs/ROLES-AND-PERMISSIONS.md).

## Boundaries

- **`main` is the integration branch.** New work branches off `main` and merges back to `main`.
  `develop` is no longer integration - do not start a branch from it, and do not treat
  `origin/develop` as current. Before branching, or before trusting a "my base is current"
  check, diff your branch point against local `main`
  (`git log --oneline <your-base>..main`), not `develop`.
- **Deliver locally.** no-mistakes reviews, tests, lint, and docs run locally. Do not push, open a PR, or change GitHub unless the captain explicitly asks. When they do ask to publish, no-mistakes is the path and yolo stays off.
- **A negative CTP is correct. Never add a guard, a clamp, or a floor on it.** The captain
  declined that guard deliberately - see
  [docs/MONEY-MODEL.md § A negative CTP is correct](docs/MONEY-MODEL.md#a-negative-ctp-is-correct).
- **Do not build receipt-photo / OCR prefill for Settle.** Parked by the captain on 2026-08-17 -
  see [docs/MONEY-MODEL.md § Not planned now](docs/MONEY-MODEL.md#not-planned-now).
- Settled-shift money mutations go only through the atomic batches in
  `src/utils/closeoutPersistence.js`; a new `auditEvents` type or key must also be whitelisted in
  `firestore.rules`, or the whole batch is rejected. Details:
  [docs/DATA-PERSISTENCE.md](docs/DATA-PERSISTENCE.md).
- Before deploying `firestore.rules`, or before the profile-name backfill, take a live save point
  (`npm run backup:live`) - that payroll write has no undo. `migrate:payout-ledger` already ran
  against production and is not a step to repeat. Full prerequisite order and status:
  [docs/DEPLOYING.md](docs/DEPLOYING.md).

## Patterns

One well-written unit in this codebase's own style - a small pure function, named export, and a
comment that carries the WHY the code cannot show (`src/utils/payoutLedger.js`):

```js
// THE TOTAL RULE: `total` is CTP (tips) + GRT (gratuity), for EVERY role.
// Cash is always a separate payment - employees are handed cash on its own and
// must see all three numbers - so it is NEVER folded into a total. Every read
// path below derives the total with this helper rather than trusting a stored
// `total`, so ledger docs written under the old cash-inclusive rule still
// produce correct numbers and reconcile correctly without a data backfill.
export function getPayoutTotal(payout = {}) {
    return r2(toMoney(payout.tips ?? payout.tip) + toMoney(payout.gratuity));
}
```

Read the whole file for the pattern at larger scale: derive money from inputs, never trust a
stored duplicate; comment the invariant the code protects, not the arithmetic it performs.

## Project Map

Full directory tree with per-file descriptions: [README.md § Architecture](README.md#architecture).

## Shift workspace (src/components/Admin/)
Handles the Floor plan → Settle up → Review flow, the closed-day payout view, and the team roster.
Key files: `AdminDashboard.jsx` (shell, day loading), `ShiftEditorPanel.jsx` (editor shell,
autosave, leave guard), `ShiftEditor/` (the three step components), `DayPayoutPanel.jsx` (settled
day), `TeamManagement.jsx` (roster and person view).
Pattern: shell, chrome, and Pullenberg-kit conventions in [docs/UI-CONVENTIONS.md](docs/UI-CONVENTIONS.md).
Settle up supports concurrent Supervisors while a shift is unsettled: `ShiftEditorPanel.jsx` reads
the shift via a live `onSnapshot` (not a one-time `getDoc`), and a dining team's money/contracts/
`markedDone` write to their own `shifts/{date}/settleGroups/{teamId}` doc rather than the whole
shift doc - `teams` is an array, so Firestore has no dotted-path update into one element of it (see
`src/utils/settleGroupPersistence.js`). Bar has no such doc: `barTeam` is already a map on the
shift doc, so its scoped write is a plain dotted-path `updateDoc`. Runners is excluded from the
done-state gate entirely. Whichever group's tab is currently active is protected from remote
overwrites (so a live update from elsewhere never reverts in-flight typing); every other group
stays live-fresh. Direction A: the tab strip stays on Settle up - switching groups never navigates
away - and the day landing's who's-left checklist (`DayRailLanding.jsx`) is a read-only render of
the same `buildCloseoutGroups` (`shiftEditorUtils.js`) ShiftEditorPanel itself uses. Friendly entry
(Path 3, on top of Direction A): the checklist marks whichever group the signed-in viewer is on
tonight's floor plan with a "· yours" row hint (`findViewerGroup`, `shiftEditorUtils.js`, scans
`teams[].members`/`barTeam.members` by uid; Runners is never scanned - it has nothing to match to).
Every row, not a pinned card or a footer button, carries the tap into Settle up - the captain cut
the pinned "your team tonight" card and the footer's "Continue Settle up →" for everyone, including
the manager, since both duplicated tapping a row (Settle-landing review, 2026-08-25; see
`data/tip-tracker-settle-landing-review/report.md`). Save and Mark Done is a floating action
(`MarkDoneAction`, `ShiftEditor/CloseoutEntryPanel.jsx`, rendered through `FloatingActions` from
`SettleStep.jsx`), not a button inside the entry panel; the panel keeps only the quiet "mark
cleared" cue. Marking a group done returns to the who's-left landing (`onGroupMarkedDone`, threaded
`ShiftEditorPanel` → `AdminDashboard`), and once every gated group is done the landing's footer
swaps to "All groups closed - Review →" - the landing's day rail carries no Next control of its own
(`DayRail.jsx`'s `hideNext` prop), since that footer is the handoff; editor steps keep their Next
pill.

## Pay statement (src/components/Pay/)
Handles the pay stub: one range of days, CTP/GRT/Total/cash, for a person.
Key files: `PayStatement.jsx` (the shared component), `PayView.jsx` (your own pay - Team's person
view renders `PayStatement.jsx` directly for a colleague's), `src/utils/payStatement.js`
(`getPayStatementPeriod` is the paycheck period: the biweekly block that contains the viewed
week's start, never the previous already-paid period because the current one is still open).
Pattern: pay stub not a dashboard, no charts or comparisons - [docs/MONEY-MODEL.md § The Pay Statement](docs/MONEY-MODEL.md#the-pay-statement).

## Account, app bar, and auth (src/components/Account/, src/components/AppBar/, src/components/Auth/)
Handles identity, the account sheet, the shared app bar and date pill, and login/approval.
Key files: `AccountSheet.jsx`, `IdentityCard.jsx`, `AppBar.jsx`, `Login.jsx`, `PendingApproval.jsx`.
Pattern: one shared bar for both app halves, no second date control - [docs/UI-CONVENTIONS.md](docs/UI-CONVENTIONS.md).

## Design system primitives (src/components/ui/)
Handles the shared visual vocabulary: badges, buttons, cards, inputs, tables, tabs, the top
progress bar.
Key files: `Badge.jsx`, `Button.jsx`, `Card.jsx`, `Input.jsx`, `PageHeader.jsx`, `Select.jsx`,
`Spinner.jsx`, `Table.jsx`, `Tabs.jsx`, `Textarea.jsx`, `TopProgressBar.jsx`, re-exported from
`index.js`.
Pattern: colors/radii via `var(--color-*)` CSS custom properties, never a raw Tailwind palette
class - see Code Conventions above.

## Pure logic and persistence (src/utils/)
Handles the payout engine, the day/role/permission vocabulary, and every atomic Firestore write.
Key files: `engine.js` (calculation engine, numbered sections), `payoutLedger.js` (totals,
reconciliation), `dayFlow.js` (the Floor/Settle/Review rail), `permissions.js` (every capability,
named once), `roleLabels.js` (role wording), `closeoutPersistence.js` /
`tempStaffMergePersistence.js` (atomic Firestore batches), `shiftBalance.js` / `saveFailure.js`
(the Confirm & Save gate), `settleStatus.js` (a group's money-in and close-readiness status),
`settleGroupPersistence.js` (parallel Settle up's per-group scoped Firestore writes),
`placeMemory.js` (which screen/tab/date/step a viewer was last on, in localStorage keyed by
uid - not react-router, not Firestore; App.jsx and AdminDashboard.jsx each own writing their own
surface so two writers never race on one entry - see the module's own comments).
Pattern: pure functions, named exports, colocated tests - the WHY behind these files is in
[docs/MONEY-MODEL.md](docs/MONEY-MODEL.md), [docs/ROLES-AND-PERMISSIONS.md](docs/ROLES-AND-PERMISSIONS.md),
and [docs/DATA-PERSISTENCE.md](docs/DATA-PERSISTENCE.md).

## Services, context, and config (src/services/, src/context/, src/config/)
Handles the Firestore access layer, app-wide React state, and SDK setup.
Key files: `services/dataService.js` (Firestore read/write/subscribe), `context/AuthContext.jsx`
(auth state, the profile, the manager pointer), `context/PendingActionsContext.js` (the shared
loading cue), `config/firebase.js` (SDK init).
Pattern: `PendingActionsContext`'s ref-counted cue is documented in [docs/UI-CONVENTIONS.md](docs/UI-CONVENTIONS.md).

## Docs (docs/)
Handles the hard-won detail this file only points at.
Key files: `TESTING.md` (authoritative: Mac setup, dev loop, test gate, branch model),
`MONEY-MODEL.md` (the payout engine's policy and sharp edges), `ROLES-AND-PERMISSIONS.md` (role
vs. tier vs. capability), `UI-CONVENTIONS.md` (shell, chrome, and the Pullenberg kit),
`DATA-PERSISTENCE.md` (atomic write paths), `DEPLOYING.md` (backup and backfill order before a
rules deploy), `MANAGER-CHANGEOVER.md` (the production tier changeover procedure),
`MANAGING-TEMPORARY-STAFF.md` (manager-facing merge workflow).
Pattern: one topic per file, linked from here - never duplicated back into this file.

## Tests and scripts (tests/, scripts/)
Handles rules tests, browser tests, and one-off operational Node scripts.
Key files: `tests/rules/` (Firestore rules, `node --test` against the emulator, one `projectId`
per suite file), `tests/e2e/` (Playwright), `scripts/seed-emulators.mjs`,
`scripts/backup-live.mjs`, `scripts/backfill-user-profile-names.mjs`,
`scripts/migrate-payout-ledger.mjs`.
Pattern: full detail in [docs/TESTING.md](docs/TESTING.md).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
