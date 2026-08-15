# Follow-up: split `ShiftEditorPanel` by step

Proposed on 2026-08-14, out of the `tip-tracker-settle-visual-lane` session. Not started.
This is a behaviour-preserving refactor. It has no visual payoff and should not be bundled
with UI work.

## What is NOT the problem

The landing/editor split is correct and should be kept.

`DayRailLanding` (read-only day) and `ShiftEditorPanel` (draft state, autosave, save) are
separate tabs in `AdminDashboard`, and the editor is `lazy()`-imported. The build confirms
that boundary is load-bearing: the editor is its own **88 kB / 22.6 kB gzipped** chunk that
never ships to someone merely looking at a day. `DayRail` is already a shared component
taking props, mounted by both - that is the reuse done correctly, not duplication.

Collapsing the two screens would trade a fast landing for one larger component. Don't.

## The problem

`src/components/Admin/ShiftEditorPanel.jsx` is **2,526 lines - about 4x the next largest
file in the tree** - holding **23 components** and **43 hook calls**. It is three screens
(floor, settle, review) plus save orchestration, payout mapping, autosave and the leave
guard in one module.

It is disciplined and unusually well commented, so this is not rot. It is a size problem:
it is the file where things hide. Two concrete costs observed while working in it:

- `const activeGroup = closeoutGroups.find(g => g.id === activeGroupId) || closeoutGroups[0]`
  silently falls back to the first group when an id misses. A silent fallback and a broken
  tab look identical on screen, which cost real time chasing a phantom duplicate-id bug.
- The settle markup nests about ten levels deep, so every small change means locating a
  fragment inside 2,500 lines.

## Proposed shape

Keep the tab boundary. Split the component by step:

- `ShiftEditorPanel` -> a shell owning shift state, autosave, save and step routing
- `FloorStep` / `SettleStep` / `ReviewStep` -> one file each
- The presentational pieces currently inline -> their own files:
  `PoolField`, `RailPill`, `CloseoutEntryPanel`, `TeamPoolFields`, `BarPoolFields`,
  `PointSplitDisclosure`, `LedgerRow`, `SpotCheckCard`, `CalculatedPayoutReview`

Mechanical and behaviour-preserving. The win is that the settle surface becomes something
one person can hold in their head.

## Worth folding in while there

Consider whether the `|| closeoutGroups[0]` fallback should stay silent. A group id that
does not resolve is a bug, and today it renders as "the tab did not respond".

## Gate

Behaviour-preserving means the existing suite is the proof: `npm run test:all` (unit,
rules, e2e, lint, build) must be green before and after, with no test edits beyond moved
import paths. Needs a lane that owns the shared emulator ports (5173 / 8081 / 9099).
