# UI Conventions and Chrome

Shared shell components and layout rules for the admin workspace. Read this before adding a new
loading indicator, a new floating control, a new date picker, or reworking a screen to match the
Pullenberg design kit.

## One shared progress cue, not a new spinner

Slow async work in the admin workspace drives one shared cue: call `beginPendingAction()` from
`src/context/PendingActionsContext.js` and release it when the work settles. `AdminDashboard`
owns the state and renders the single `TopProgressBar`; the count is ref-counted, so a save
handing over to a refetch stays one continuous bar. The day landing holds its current content
across a refetch rather than blanking, and `dayDataDate` is what keeps that honest - money
renders only for the date it was loaded for.

## Floating actions have one home

Every bottom-right floating action renders through `src/components/Admin/FloatingActions.jsx` -
do not re-add a bare `fixed bottom-5 right-5` button. It owns the corner geometry and the scroll
reveal, and it hides only on a real wheel/touch gesture, so a layout-induced scroll can never
make a commit button disappear; its header comment explains why.

## The editor's leave guard

Every exit from `ShiftEditorPanel` must pass its leave guard. The panel hands one up through
`onRegisterLeaveGuard`; `AdminDashboard` consults it before any tab switch (home control, desktop
sidebar, account sheet). Calling `setActiveTab` directly walks past the confirmation and silently
discards an in-progress edit to a closed shift, whose changes never persist until Confirm & Save.

## Stacking order

Admin chrome stacking order, stated once so it is not rediscovered: app bar `z-40` > floating
Edit/Confirm FABs `z-30` > sticky Day Rail `z-10`. The bar has to outrank the FABs because the
account sheet opens out of it as a bottom sheet, landing exactly where they float. `sticky top-14
z-10` under the app bar is the app's one shape for a control that must stay reachable down a long
page - the Day Rail and the Team person view's "Team roster" back control both use it. Reach for
that before inventing anything else; the bottom-right corner is FloatingActions' and a phone has
no top-level nav.

## The app bar and the date pill

The app bar (`src/components/AppBar/AppBar.jsx`) is shared by BOTH halves - the workspace and the
pay statement - so a person who holds both never meets two different bars. It owns the day:
`BarDatePill` is the interactive day picker on the Shifts tab, renders `readOnly` (a label,
`data-testid="editor-day-label"`) on the editor tab, and takes `unit="week"` on the pay side
where the thing being read is a week. The Floor-step `DayChipStrip` is the only in-editor date
change, and only because Floor has no half-typed money; Settle and Review stay locked so a date
swap cannot orphan a draft. Same control, relabelled per screen - do not add a second date
control anywhere, in the editor or on a statement.

Prev/next live INSIDE that same pill as a three-segment control, and they step in `unit`: a day
on the day screens, one Friday-start work week on the pay ones (`stepDateKey` in
`src/utils/dateUtils.js` is the only derivation, and re-anchors to the week's Friday rather than
moving seven days). The `readOnly` label carries none - a step control there would be a back door
around the one rule the label exists for.

A step must not RESIZE the pill - the thumb is still on the arrow when the label swaps, so the
week label reads `Week of <Friday>` in every state and lets the accent/warning tone alone say
which week is current (the "This week ·" wording was removed for exactly this reason on
2026-08-15, and survives only in the aria-label so the cue is never colour-only; the day pill's
"Today ·" was shown to the captain the same day and initially KEPT despite the same 16px jump -
but on 2026-08-16 the actual Pullenberg kit turned up and showed neither pill ever carries that
word, so the day pill dropped it too and both now read a plain date/range in every state,
matching each other and the kit).

The shell itself moved to the kit's own look that same day: transparent background, a 36px
height (kit sizing - see "kit wins over convention" below), and the calendar icon plus both step
chevrons all reading the one `--color-bar-mint` token so the three glyphs read as one set; only
the border still carries which day/week is current, since the kit's own DatePill never had to
depict that state live. The bar is width-bound, not taste-bound: at 320px the widest state
("Week of Aug 14", 186px) leaves 14px clear of the home button, which is why the picker's old
dropdown chevron is gone. Measure before adding anything else to it.

`BarDatePill`'s ink/mint tokens are tuned for the dark app bar; embedding it on a light card
(Team's person-view pay history) needs `surface="card"` or the text and icons are unreadable -
the bar's own usage stays untouched at the `surface="bar"` default.

## Account sheet and identity

`AccountSheet` (`src/components/Account/`) keeps once-a-shift and low-frequency controls out of
the primary bar. It holds identity plus Log Out and takes an `items` array for destinations that
do not deserve a permanent phone control.

`Your account` and Team's person view share `src/components/Account/IdentityCard.jsx`; keep own/
manage identity facts in that one component. Profile self-service is field-scoped in
`firestore.rules`, and name changes use `src/utils/accountProfilePersistence.js` to atomically
update `users/{uid}` plus uid-keyed name stamps on setup shifts. Settled shift names remain
frozen.

## A phone has no top-level navigation, deliberately

The workspace menu and its hamburger were deleted; `AccountSheet` `items` carries every
top-level destination at every width (Team, and `Shifts` for whoever's home is not Shifts). On
the day itself the phone still has the Day Rail and, on Shifts plus the Floor step, the
`DayChipStrip`. The workspace `<aside>` in `AdminDashboard.jsx` is desktop-only (`hidden
lg:block`) and carries no phone case. Do not add a bottom tab bar or a segmented replacement: the
floating Edit and Confirm controls already own that corner, and a persistent side-switcher in the
bar was weighed against this shape and declined (it spends the ~67px of slack at 320px that
dropping the hamburger bought).

## The Pullenberg kit is the authority

**Where the Pullenberg kit specifies something for a control, the kit wins over this app's older
internal conventions** - sizing, color, shape, whatever the kit states. The 44px thumb-target
default is one instance of this, not a special case carved out for it: 44px remains the app's
usual comfortable phone tap-target size and stays that way anywhere the kit doesn't say
otherwise, but a control the kit sizes or colors differently (e.g. `BarDatePill`'s 36px outline
pill and its `--color-bar-mint` icon set) follows the kit instead. Do not "fix" a kit-specified
control back toward the old convention.

### Matching a screen to the kit is measurement work, not eyeballing

Lessons from rebuilding Settle (`fm/tip-tracker-pullenberg-settle`) that generalize to the next
screen matched to the kit:

- A "gap on the sides" or "too much scroll" complaint is almost never one layer. Walk the FULL
  ancestor chain with `getComputedStyle()`/`getBoundingClientRect()` from the element up to
  `#root`, not just the nearest parent - Settle had three independently-reasonable padding
  layers (a section's own bottom reserve, the step-content wrapper's padding, `main`'s padding)
  stacking into 128px of dead space that no single layer's code looked wrong in isolation.
- A bleed (`-mx-N` to run edge-to-edge) must cancel EVERY ancestor padding layer between the
  element and the true screen edge, not just the closest one - canceling only `stepContent`'s
  padding left the band one layer short of the actual edge, invisible on a desktop screenshot and
  only caught from a real-device inspector.
- To confirm a custom webfont actually rendered (vs a silent fallback), don't trust
  `document.fonts` - it reports per-subset `@font-face` entries and reads as "loaded" even when
  the visible glyphs fell back. Compare rendered pixel width via canvas `measureText()` against
  the fallback font's width; that's ground truth.
- Browser automation tools may silently clamp viewport resizes below some floor (one session's
  tool floored at 500px, so requested-402px screenshots were actually 500px) - verify the tool
  honored the width you asked for before trusting a "matches design at 402px" claim, and disclose
  the discrepancy rather than reporting false precision.
- `justify-between`-style spread layouts fall back to packed + scrollable automatically when
  content overflows, no JS measurement needed - but scope any such spread to the phone breakpoint
  (`max-[560px]:`) only. Unscoped, it spreads sparse content across a wide desktop viewport and
  reads as scattered; the kit's own spread mockups assume phone width.
- One bottom-sheet convention for the whole app: drag handle, rounded top, serif header,
  scrollable body, footer Done, `z-50` (above the floating action pair's `z-30`, or the sheet
  renders under it). `PointSplitDisclosure.jsx` and `ContractsDisclosure.jsx` are two independent
  instances of the same shape - copy that pattern for the next disclosure rather than inventing
  an inline-expand or a different sheet shape.
- A controlled numeric input must distinguish `null`/`undefined` ("untouched, show the default")
  from `""` ("user just cleared it, show blank") - collapsing both to the same default-fallback
  means backspacing to empty snaps straight back to a number and the field can never be retyped.
- Live-editing a "setup" shift's floor plan for testing (adding teams, etc.) autosaves within
  about a second. There is no Cancel/Done on Floor or Settle - both are directly editable - so
  leaving the editor does not revert already-persisted draft changes. Explicitly undo test data
  with the same UI (remove the teams) rather than assuming an exit reverted it. On a closed shift
  the leave guard still asks before dropping unsaved Review work.

### Shell and payout screen rebuilds

`AdminDashboard.jsx`'s outer shell (sidebar, header, day-chip strip) was rebuilt to the kit's
`WorkspaceScreen.jsx` on 2026-08-16. The sidebar is now the kit's fixed 224px `--color-bar-bg`
dark column with no collapse toggle - the old rail-width/full-width hamburger toggle was this
app's own invention with no kit equivalent and was removed outright, not kept alongside.
`DayChipStrip.jsx` is new: a week-of-day picker (kit's `DayChip`) wired to real `setSelectedDate`
and a lightweight `where("date","in",[...7 keys])` status-only read (`weekStatuses` in
`AdminDashboard.jsx`) separate from `fetchDayPayouts`'s full-money read for the one selected day.
Two decisions the kit's static mock didn't have to make: the week is Friday-anchored
(`getCurrentWeek`, the same boundary the pay side already uses) rather than the kit's raw
Monday-start demo order; and a SELECTED day that is not today gets its own accent-bordered
treatment distinct from both the dark "today" cell and an ordinary cell, since the kit mock
always has selected===today. The strip renders on the Shifts tab and during the floor editor's
Floor step (`selectDateFromFloorEditor` exits back to Shifts for the new date, so a run of open
days can be flipped through). Team has no date. Settle and Review keep the strip hidden and
`BarDatePill` read-only - those steps carry half-typed money a date swap could orphan. That lock
is a data-safety guard, not a style choice. `DayRailLanding.jsx`'s own internal states (the
Floor/Settle/Review rail, `SkipToFloorPlan`) were deliberately left untouched in that pass - the
shell and the landing's internal content are separate concerns, and unifying the
Floor/Settle/Review editor (the kit's own mock has no equivalent to the app's multi-stage day
flow) is still an open question for whoever picks it back up.

`DayPayoutPanel.jsx` (the closed-day "Pay out" view) was rebuilt to the kit's
`WorkspaceScreen.jsx` payout section on 2026-08-17: a headline `PoolSummaryCards` row above the
table, and a `Badge`+title "Payout" card header echoing the kit's "Tonight's payout" + status
badge. The kit draws exactly 3 undivided pool tiles (its demo data has no bar team); this app's
tiles are **Dining pool, Bar pool, Cash, Runner pay** instead, kept dining/bar separate per the
[money model](MONEY-MODEL.md) rather than copying the kit's flatter shape. Both the cards and the
payout table's new "Everyone paid" footer are summed straight off `summary.payouts.roleGrouped` -
the same rows the table renders - never off the engine's pool-adjustment fields, so the two can
never disagree by a rounding penny; "Everyone paid" reuses Review's own established wording
(`CalculatedPayoutReview.jsx`'s "= Everyone paid" ledger row) for the same all-pools CTP+GRT
figure, deliberately not the kit's generic "Pool total". The old dual desktop-always-open /
mobile-accordion `AuditSummary` is now one collapsed-by-default disclosure at every width, moved
below the payout table as supporting evidence (mirrors Review's own disclosure-row pattern) now
that the headline cards cover the kit's "glance" job. Team-worked and role now render as a
`Badge` pill in both the table and the mobile card list, matching the kit's role-pill look,
without dropping the Points/Cash columns the kit's simplified roster never needed to show.
`TeamManagement.jsx`'s roster is a phone-first search/filter row list rather than the kit's flat
3-column table (the kit's own mock has no search, filters, or supervisor cue to represent) but
already shares the kit's `Badge`/`Card` primitives and tokens, so it was left as-is.
