# The Money Model

The engine (`src/utils/engine.js`) is a pure function with numbered sections that are the
authority on the arithmetic. This document is the restaurant policy behind those sections -
the WHY the code cannot show - plus the sharp edges that have shipped wrong before. See also
the README's ["Why the Calculation Engine Is Shaped This Way"](../README.md#why-the-calculation-engine-is-shaped-this-way)
for the top-level policy summary.

## The total rule, absolute

A payout `total` is CTP (charged tip) + GRT (gratuity) for EVERY role. Cash is always paid and
reported separately and is never folded into a total. `getPayoutTotal` in
`src/utils/payoutLedger.js` is the single definition - derive totals with it rather than
trusting a stored `total`, because production ledger docs predate the rule. `reconcilePayoutLedger`
balances the non-cash and cash sides separately; move money between them and the books stop
balancing. Cash is also handed over **weekly**, which is why `PayStatement.jsx` shows it on the
week card and deliberately carries NO cash line in the two-week pay-period block - a fortnight's
cash is money that never lands with that period's advice. Do not "restore" it.

Speak the captain's vocabulary in UI copy, comments, and commit messages: **CTP** = charged tip,
**GRT** = gratuity, **Floor plan** / **Settle up** / **Review** are the day's steps
(`src/utils/dayFlow.js` is the authority on the rail), and the closeout ledger audit is the
shift's money trail. Renaming any of these in the UI costs the captain their scanning habits -
keep a label in step with the field it mirrors.

## Dining and bar are separate pools

Dining and bar are SEPARATE pools with separate point values (`engine.js` §4 team pools vs §7
bar distribution). A figure that sums both is never "the floor's" - that exact mislabel shipped
and had to be corrected on 2026-08-12. Two allocations look like deductions and are not:

- **Bar allocation** (`barCTPAllocation` / `barGRTAllocation`) comes off the dining pools and
  lands on the bar pools, so it never leaves staff and is already inside both staff take-home
  and the floor split. Show it as a subtraction on the dining ledger and an addition on the bar
  ledger, never against the combined total - doing so double-counts it and breaks
  `pool - house/door = take-home`. `engine.js` zeroes both when no bartender is on the floor
  (`hasBarTeam`).
- The bar pool's **"Runners Fee"** field (`pools.runners`, surfaced as `runnerTransfer` in
  `src/components/Admin/shiftEditorUtils.js`) MOVES CTP from the bar pool to the dining pool. It
  is money the captain entered; it changes who splits the money, not how much there is. It is
  NOT per-runner runner pay (`RUNNER_FLAT_RATE`, `totalRunnerPay`), which leaves the pool
  entirely as a deduction off the top. Same words, opposite behaviour - the split-ledger
  derivation in `src/components/Admin/ShiftEditor/CalculatedPayoutReview.jsx` documents both
  sides of the equation. The saved day's allocations row for `totalRunnerPay` reads
  **"Runner Pay"** (`DayPayoutPanel.jsx`) so the two stop sharing a name; the Settle up field
  keeps "Runners Fee", which is what the captain calls it.

  **What the fee IS: 3% of the bar's total food sales** (`pools.foodSales`, entered on the bar
  settle card, `RUNNERS_FEE_FOOD_SALES_RATE`). But the **AMOUNT is the field**, not the
  percentage - the rate is not always 3% and a manager varies it by editing the amount - so
  food sales only ever PREFILLS the fee, and only while the fee still equals 3% of the previous
  figure (`applyBarFoodSalesEdit`). That tracking rule is what protects history: entering food
  sales on a shift settled before the field existed leaves its blind-typed fee alone instead of
  silently re-deriving that night's money. The engine is deliberately never told the rate - it
  takes the amount and records food sales as `derivedValues.barFoodSales`, spending none of it,
  which is why an absent figure cannot move a cent. **The "Edited" marker is derived, never
  stored** (`isRunnersFeeOverridden`): amount vs 3% of food sales, so a shift with no food sales
  figure has nothing to disagree with and stays quiet rather than being marked for having been
  typed under the old model.

## The contract gratuity rate is fixed, not per-contract, and it stepped once

Contract sales are inferred from the gratuity actually charged (`grtContractTotal / rate` in
`engine.js` §1, `getContractRate`), never entered directly - so the rate has to be right without
anyone typing it. It was a flat 26% until the restaurant raised it to **27% for shifts dated
2026-08-26 onward**; a night already paid at 26% stays 26% forever, so the cutoff is keyed on the
**shift's own date**, never the clock when someone opens the editor or re-saves it. There is no
per-contract rate field and no 26/27 picker in the UI - one date-keyed constant in `engine.js` is
the only place the rate lives. `ShiftEditorPanel.jsx` passes its `date` prop (the night being
viewed, not today) into `calculateShift` for exactly this reason; a call that omits `date`
(undated tests, any leftover caller) stays on 26% rather than silently jumping to 27%.
`src/utils/engine.test.js` pins both sides of the cutoff.

## A negative CTP is correct

**Never add a guard, a clamp or a floor.** In the captain's own words: the bar's fees are paid
from CTP, so on a night that is only a contract - everything arrives as GRT and there is no
charged tip to draw from - the runners' pay still comes out of CTP and that night's CTP goes
negative. "But then at the end of the week, it balances it out because you just subtract the
negative from their total CTP." The week's CTP total nets the negative night against the
positive ones, and that netted week is what the pay statement already shows, so **anything that
changes must leave the weekly netting working**.

An investigation flagged "a bartender is recorded as owing $700" as a hole to close; the
observation was right and the conclusion was wrong, and the captain declined the guard
deliberately on 2026-08-14. What was asked for instead is honesty: `NegativeNightNotice` names
whoever the night records at a negative and says why, on Review and on the settled day, styled
as a neutral statement and never as a warning - it blocks nothing. `src/utils/engine.test.js`
pins a contract-only night that drives the bar CTP negative, balances at 0 and passes the settle
gate; the dining-side twin is pinned beside it. See also
[UI-CONVENTIONS.md](UI-CONVENTIONS.md) for how `NegativeNightNotice` is styled and where it
renders.

## An allocation for a role nobody works is not taken at all

`engine.js` §2 gates two carve-outs on who is actually on the floor: the bar 1%s on
`hasBarTeam`, and the captain override 1%s (`captainOverrideCTP` / `captainOverrideGRT`) on
`hasCaptainOnFloor`. Money carved out for an absent role is paid to nobody, and because
`reconcilePayoutLedger` throws rather than warns, the shift then cannot be settled AT ALL - a
one-server night was unclosable until 2026-08-14. On a no-captain night that 1% stays in the
pool the team splits and does NOT go to the house; that was the captain's explicit choice
between the two balancing options. The floor-plan check must keep matching how §9 finds
captains (`member.role === "captain"`) or the two disagree and the money strands again, and both
sides of the override move together - they are one person's cut of the two halves of the money.
`src/utils/engine.test.js` pins both directions, including that a shift WITH a captain is
unchanged to the cent.

## The Confirm & Save gate

**The write itself blocks on exactly one thing: the shift must balance to within five cents.**
Everything else on Review is a warning. `saveClosedShiftAtomically` re-runs
`reconcilePayoutLedger` and throws before building the batch, so Review must never offer a save
the write path would refuse - `describeShiftBalance` (`src/utils/shiftBalance.js`) mirrors that
check, disables the button and says which pool the money is stranded in, reading the engine's
own `balances.poolBalances` (whose entries sum exactly to `overallBalance`) rather than
re-deriving anything. Keep the two in step. The button itself carries one more, UI-only gate on
top of this - see "Parallel Settle up's close gate" below - but the atomic write is otherwise
unchanged: it is still one commit, still gated only on balance.

### Parallel Settle up's close gate

Since 2026-08-23 (Direction A, locked with the captain), the Confirm & Save button is also
disabled until every assigned dining team and Bar are marked done on Settle up
(`summarizeCloseReadiness`, `src/utils/settleStatus.js`) - this is checked in
`ShiftEditorPanel.jsx`'s `closeGateBlocked`, entirely separate from `saveBlocked`'s balance check
above, and only while the shift is still unsettled (`shiftStatus !== "closed"`; a later correction
re-save asks only that the shift balances, same as always). Runners is excluded from this gate by
construction - it defaults done and is never read by `summarizeCloseReadiness`.

Money entered during this unsettled phase writes to a live per-group scoped location rather than
the whole shift document, so two Supervisors settling different groups at once cannot overwrite
each other - see `src/utils/settleGroupPersistence.js` for the mechanism and why a dining team
needs a `shifts/{date}/settleGroups/{teamId}` doc of its own (Bar does not: it's a single map
field, so its scoped write is a plain dotted-path update).

**One accepted, deliberate risk, not a bug to "fix" without checking back with the captain
first**: if two Supervisors are ever on the exact SAME group at the same moment, whichever
scoped write lands last is kept silently - no lock, no warning. Chosen over locking or blocking,
for simplicity, when the plan was scoped (`data/tip-tracker-parallel-settle-plan/report.md`,
Q5). It is a narrower race than the whole-document one this feature replaces: it only bites on
the exact same group, never on two different groups.

`describeSaveFailure` (`src/utils/saveFailure.js`) covers the other end - a save that WAS
attempted and refused - and its fallback branch must keep carrying the raw error text; the
screen once said "Failed to save." and nothing else, with the real diagnostic in the browser
console alone.

Related trap, flagged in `firestore.rules` beside the rule that causes it: `validUserProfile()`
requires a non-empty `firstName` on UPDATE and Firestore validates the merged document, so one
legacy profile with no first name refuses the whole closeout batch and makes every shift that
person worked unsaveable. **This is documented in full, with the exact failure mode and the
fix procedure, in [DEPLOYING.md](DEPLOYING.md)** - read that before deploying `firestore.rules`
to any project, and take a `npm run backup:live` save point before the backfill, since that
payroll write has no undo. Nothing runs the backfill automatically, and nothing should - the
captain settled that on 2026-08-14, because a predeploy hook would fire a production data
mutation on every future deploy with nobody reading the plan. (`migrate:payout-ledger` is a
separate, already-completed migration - see [DEPLOYING.md](DEPLOYING.md#the-payout-ledger-migration-is-already-done)
for its status.)

## The Pay Statement

**One pay statement, for a person and a date range** - `src/components/Pay/PayStatement.jsx`.
Your own pay (`PayView.jsx`) and a colleague's (the Team roster's person view) are the same
component, or the two drift inside a release. It is a **pay stub, not a dashboard**: every day
in the range listed worked or not, CTP/GRT/Total in the payout table's own words, the week's
cash on its own line and never in a total (see the total rule above for why the pay-period block
carries none), the pay period with its advice date, and the history boundary
`PAY_RECORDS_START_KEY` (`src/utils/payStatement.js`, a named date and never a rolling window).
The paycheck line, period dates, and CTP/GRT/period-total follow the week on screen via
`getPayStatementPeriod` (the biweekly period that contains that week's start). Do not snap to
the previous already-paid period because the current one has not closed - that is what put last
period's paycheck on an in-progress week. Cash stays weekly on the viewed week. A fully past
week already uses that week's own period.
No charts, no trend, no average, no best day, no pool maths, no comparison to colleagues - the
captain has had that shape removed twice. The component decides neither who may read it
(firestore.rules does, by uid or captain access) nor the identity header, and it never writes.

## Not planned now

**Receipt-photo / OCR prefill for Settle is a future feature, not now.** The captain parked it
on 2026-08-17 - do not build any OCR, photo upload, or Settle prefill. Research lives at the
firstmate home (`data/tip-tracker-receipt-ocr-scout/report.md`,
`data/receipt-ocr-lab-on-device-research/report.md`). Contracts are 27% of the guest-check
Gratuity as of 2026-08-26; older paid nights used 26%. Not a server-sales line - keep that
distinction in mind if this is picked back up.
