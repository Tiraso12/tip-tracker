# Tip Tracker Roadmap

This file is the shared project memory for Tip Tracker improvements. It keeps version goals, decisions, and checklists outside of chat so each work session can pick up cleanly.

## Current Version

- Version name: `v0.7.0-ui-polish`
- Branch: `feature-ui-ux` (pushed to `origin/feature-ui-ux`, commit `296fce2`)
- Status: Pushed for review (PR not yet opened)
- Started: 2026-05-15
- Completed: 2026-05-15
- Goal: Move from hand-rolled dark CSS Modules to a refined minimalist light theme using Tailwind CSS v4. Replace ad-hoc styling with reusable UI primitives. Improve consistency and the perceived professionalism of the app.
- Current working state: All 13 screens migrated to Tailwind. 11 legacy CSS modules deleted (~3,100 lines of CSS removed); only `ShiftSetup/ShiftSetup.module.css` remains, themed via the backwards-compat shim. `npm run lint`, `npm test` (7/7), and `npm run build` pass. Visually verified on Login, employee dashboard (full scroll), AdminDashboard shell at desktop 1280×900 and mobile 375×812. Admin child panels (DayPayoutPanel, ShiftEditor, TeamManagement, AdminReportsPanel) compile-verified; full visual review with real data still pending. PR to `develop` will be opened by the user.

## Version History

| Version | Name | Status | Goal |
| --- | --- | --- | --- |
| `v0.1.0` | Foundation | Complete | Clean baseline, protected payout math, safer auth/data flow |
| `v0.2.0` | Admin Workflow | Complete | Smaller admin modules, better shift validation, safer saves |
| `v0.3.0` | Employee Dashboard | Complete | Richer employee earnings summaries and clearer weekly/pay-period totals |
| `v0.4.0` | User Management | Complete | Safer account status handling, temporary staff merge rules, better team setup |
| `v0.5.0` | Admin Daily Workflow | Complete | One-screen shift workspace, live closeout totals, and safer payout review |
| `v0.6.0` | Reports | Complete | More accurate weekly/monthly/pay-period reports and exports |
| `v0.7.0` | UI Polish | Pushed for review | Refined minimalist light theme on Tailwind v4, reusable UI primitives |

## Guiding Principles

- Protect the working app while improving it.
- Keep payout math trustworthy before changing workflows.
- Prefer small, verifiable updates over broad rewrites.
- Keep user data and employee payout records private by default.
- Document decisions that affect restaurant rules or money calculations.

## v0.1.0-foundation

### Scope

This version is about reliability, clarity, and safety. It should not become a full redesign. UI polish can happen, but only when it supports the foundation work.

### Checklist

- [x] Fix the current lint errors.
- [x] Repair the admin detection bug in `BiweeklySummary`.
- [x] Remove or quarantine unused legacy auth code.
- [x] Add tests for `calculateShift`.
- [x] Document payout rules covered by tests.
- [x] Review and tighten Firestore user read rules.
- [x] Decide on a safer username lookup strategy.
- [x] Improve data freshness for employee tip history.
- [x] Clean up debug logs and unused variables.
- [x] Confirm `npm run lint` passes.
- [x] Confirm `npm run build` passes.

### Known Findings From Initial Review

- `npm run lint` and `npm run build` pass as of the first foundation cleanup.
- Initial lint failures were unused variables/imports and hook dependency warnings.
- `BiweeklySummary` previously read `isAdmin` from auth context, but now derives admin status from `user.role`.
- `firestore.rules` no longer allows public reads on `users/{uid}`.
- Username login now uses a minimal public `usernames/{normalizedUsername}` mapping document.
- `src/services/authService.js` was legacy plaintext-password auth code and has been removed.
- `calculateShift` contains the core payout logic and now has first-pass automated coverage.
- Employee dashboard tip history now uses a live Firestore subscription after login.

### Payout Engine Test Ideas

- Standard restaurant team shift with captains, servers, backs, and assistants.
- Shift with bar team and bar CTP/GRT allocation.
- Shift with runner flat payouts.
- Contract gratuity shift with 26 percent contract sales calculation.
- Rounding reconciliation where cents need to balance.
- Missing employee/point edge cases.
- Negative or invalid pool warnings.
- No-captain shift behavior.

### Auth And Data Decisions To Make

- Should username login remain, or should email-only login be enough?
- If username login stays, should we create a separate public `usernames` mapping collection?
- Should employees read only `users/{uid}/tips`, or should they have controlled read access to shift documents that include their payout?
- Should admins be able to delete Firebase Auth users, or only deactivate Firestore profiles until a backend exists?

### Migration Notes

- Existing registered users need a `usernames/{normalizedUsername}` document before they can log in by username under the tighter Firestore rules.
- Email login still uses Firebase Auth directly and does not need a username mapping document.

## Future Versions

These are placeholders, not commitments.

### v0.2.0-admin-workflow

- Status: Complete
- [x] Split the large admin dashboard into smaller components.
- [x] Improve shift editor validation and save feedback.
- [x] Prevent accidental double saves.
- [x] Make temporary/unregistered staff linking clearer.

### v0.3.0-employee-dashboard

- Status: Complete
- [x] Show richer personal payout details.
- [x] Add pay-period summaries.
- [x] Improve empty states and mobile readability.

### v0.4.0-user-management

- Status: Complete
- [x] Block inactive users from accessing the employee dashboard.
- [x] Replace misleading permanent employee deletion with safer deactivate/reactivate flow.
- [x] Improve shift team setup layout with clearer assignment zones and employee role filters.
- [x] Restrict temporary staff merges to active accounts without existing shift or tip history.
- [x] Review username mapping cleanup needs for denied accounts.

Decision: denied and deactivated employee accounts keep their username mapping reserved. This prevents a future account from accidentally inheriting or confusing historical payout records. If an employee returns, admins should reactivate the same profile instead of creating a new one.

### v0.5.0-admin-daily-workflow

- Status: Complete
- [x] Add live pool totals while admins enter shift money.
- [x] Improve runner payout input visibility during pool review.
- [x] Add clearer pre-save review of calculated payout totals.
- [x] Move employee point adjustments from Team Setup into Pool Inputs review.
- [x] Prototype a one-screen Shift Workspace that combines team setup and money closeout.
- [x] Add a printable team setup sheet for posting pre-service assignments.
- [x] Reduce inline admin editor styling where it blocks maintainability.

Current behavior: Shift Editor now opens as one Shift Workspace. Opening setup appears first for assigning employees to restaurant teams, bar, and runners. Money Closeout appears below it with live totals, point adjustments, runner payout review, payout calculation, and final save confirmation.

Workflow decision: Team Floor Setup focuses on assigning who worked where. Points affect money, so point adjustments live in Money Closeout / payout review. Automatic default points are still assigned when employees are added, and admins can fix point mistakes before calculating payouts.

Print decision: `Print Team Sheet` is currently a simple training / assignment sheet, not a full floor-plan feature. It prints the current restaurant teams, bar team, and runners so managers can post pre-service assignments. Detailed station logic and floor-plan functionality can come later.

Verification status: `npm test`, `npm run lint`, and `npm run build` pass after the latest v0.5.0 changes.

Committed and pushed as `360c33c Improve admin daily shift workflow`.

### v0.6.0-reports

- Status: Complete
- [x] Start admin report employee earnings summaries for selected week, month, or pay period.
- [x] Align weekly/pay-period/monthly PDF exports with the on-screen employee earnings summary.
- [x] Improve weekly/monthly report accuracy.
- [x] Make PDF formatting consistent.
- [x] Add admin reports that summarize total earnings per employee for each selected week, month, or pay period.
- [x] Review report export permissions.

Current behavior: Admin Reports supports weekly, monthly, and pay-period views. The screen shows daily report totals plus an employee earnings summary for the selected range, including shifts worked, tips, gratuity, cash, and total pay.

PDF behavior: Weekly, pay-period, and monthly PDF exports include an employee earnings summary with shifts, tips, gratuity, cash, total pay, and average shift. PDF total pay now includes cash so it matches the on-screen report.

Verification status: `npm run lint`, `npm test`, and `npm run build` pass after the PDF export alignment. Browser automation could not reload localhost because of the in-app browser URL policy, so visual PDF/report review should be done manually.

Accuracy fix (2026-05-14): daily tips/gratuity/cash now read from `summary.derivedValues` (ctpTotal, grtTotal, baseTeamCash) so the pool total reflects what was collected rather than only what employees received. Fallback to summing payouts for older shifts. Revenue calculation also gains a fallback using `normalizedInputs` team/bar sales for shifts saved before `derivedValues` existed.

PDF fix (2026-05-14): monthly report page-break check now uses actual page height (`pageHeight - 80`) instead of a hardcoded 750 that was larger than A4 landscape height (595pt) and never triggered. Monthly totals box now includes a "Tips/Grat" line matching the weekly report.

Permissions decision: report exports require no additional guards beyond existing admin routing. The Reports tab renders only inside AdminDashboard (admin-role gated). PDF generation is purely client-side from already-loaded data. Firestore shift reads are covered by existing security rules.

### v0.7.0-ui-polish

- Status: Pushed for review (commit `296fce2` on `origin/feature-ui-ux`)
- Branch: `feature-ui-ux`
- Started: 2026-05-15
- Completed: 2026-05-15
- Goal: Move from hand-rolled dark CSS Modules to a refined minimalist light theme using Tailwind CSS v4. Replace ad-hoc styling with a small set of reusable UI primitives. Improve consistency, accessibility, and perceived professionalism.

- [x] Add Tailwind CSS v4 + `@tailwindcss/vite`; define new design tokens via `@theme`.
- [x] Rewrite `design-system.css` as a backwards-compat shim mapping legacy vars to the new light palette.
- [x] Build UI primitives: Button, Card, Input, Select, Textarea, Table, Badge, PageHeader, Tabs.
- [x] Re-skin Login and PendingApproval (auth screens).
- [x] Re-skin Header (employee), AppLayout, WeekHeader.
- [x] Re-skin Calendar (week), DayCard (week + month variants), MonthView.
- [x] Re-skin EmployeePeriodSummary; delete orphaned BiweeklySummary component.
- [x] Re-skin Charts with new palette (forest accent + sage + warm neutral, replacing violet/blue/cyan).
- [x] Restructure AdminDashboard shell with thin left sidebar nav (Shifts / Team / Reports), sticky top app bar, PageHeader pattern for the right side.
- [x] Re-skin DayPayoutPanel, TeamManagement, AdminReportsPanel, ShiftEditorPanel (incl. printable team sheet via Tailwind `print:` modifier).
- [x] Update PDF export (`pdfExport.js`) primary color to forest green to match the new on-screen theme.
- [x] Delete legacy CSS modules: AppLayout, Header, WeekHeader, Calendar, MonthView, EmployeePeriodSummary, Charts, AdminDashboard (2,004 lines), TeamManagement, Login, BiweeklySummary.
- [x] Initial responsive check at 375px (AdminDashboard sidebar correctly collapses to horizontal tab bar; PageHeader actions wrap; cards stack).
- [ ] (Optional) Re-skin ShiftSetup drag-and-drop module (currently still on legacy CSS via shim — works in new palette but could be modernized in v0.8.0).
- [ ] Full accessibility audit (focus rings, keyboard tab order, screen reader labels) — primitives already include `focus-visible:ring-*` styling and ARIA attributes, but a dedicated audit pass is recommended.
- [ ] Real-data visual review of ShiftEditor save flow, DayPayoutPanel with saved data, and AdminReportsPanel with multi-week/multi-employee data.

Tooling decision: Tailwind CSS v4 with `@tailwindcss/vite`. Design tokens live in `src/styles/tailwind.css` under `@theme`; components use `var(--color-*)` references. CSS Modules are no longer used outside the legacy `ShiftSetup/` folder. No external UI library (no shadcn/ui, no Radix) — keeping the dependency surface small.

Aesthetic: Refined minimalist light theme. Editorial typography (Fraunces display serif + Inter body + JetBrains Mono for money). Single restrained accent (forest green `#1a3d2e`). 1px borders preferred over shadows. Tighter radii (4/6/8px). Restrained motion (150ms hover transitions only, no page-load orchestration).

Layout decision (admin): the old left "Control Panel" rail wasted vertical space (3 tabs + date picker + Edit Shift button stacked in a tall column). Replaced with a thin persistent sidebar on `lg+` (Shifts / Team / Reports as nav items with icons) and a PageHeader pattern in the main column where the date picker + Edit Shift now live as toolbar actions. On `<lg` widths the sidebar collapses to a top tab bar. Sticky top app bar holds brand + Admin badge + username + Log Out across all admin views.

Diff size: 45 files changed, +3,487 / −4,677 (net −1,190 lines). The 11 deleted CSS modules account for most of the reduction.

Verification status: `npm run lint`, `npm test` (7/7), and `npm run build` all pass. Visual verification in the browser:
- Login (logged out) — new editorial card, Fraunces title, password show/hide.
- Employee dashboard — Header, WeekHeader, EmployeePeriodSummary, Calendar (week view), Charts empty-state confirmed at desktop width.
- AdminDashboard shell — sidebar layout at 1440×900, sidebar-collapsed mobile layout at 375×812.
- Admin child panels (DayPayoutPanel, ShiftEditor, TeamManagement, AdminReportsPanel) compile-verified and inspected in their empty states; full real-data review pending.

Known follow-ups for v0.8.0 or later: ShiftSetup drag-and-drop module migration; optional dark theme toggle; keyboard accessibility audit.

### v1.0.0-stable-release

- All foundation checks pass.
- Core workflows are tested.
- Security rules are reviewed.
- Admin and employee experiences are polished enough for daily use. (v0.7.0 covers the visual polish criterion.)

### Later Ideas

- Previous-period comparisons for employee dashboard trends.

### v1.1.0-security-hardening

Identified during testing phase (2026-05-14). Completed 2026-05-14.

- [x] **Firestore create rule: prevent self-elevation to admin.** `allow create` on `/users/{uid}` now enforces `role == "unassigned"` and `status == "pending"` so a user cannot set their own role via the SDK.
- [x] **Tip records: restrict employee write access.** `/users/{userId}/tips/{document=**}` is now read-only for employees; only admins write.
- [x] **Add explicit rule for `unregisteredStaff` collection.** Explicit `allow read, write: if isAdmin()` rule added — no longer relying on the catch-all.
- [x] **Fix username registration race condition.** `register()` in `AuthContext.jsx` now uses a Firestore `runTransaction` to atomically check-and-write the username doc and user doc. If the transaction loses the race, the newly-created Firebase Auth account is deleted and the error surfaces to the user.

Verification: `npm run lint`, `npm test`, and `npm run build` all pass after the changes.

## Session Notes

### 2026-05-15 v0.7.0-ui-polish

- Created and switched to `feature-ui-ux` branch off `develop` for the UI/UX overhaul.
- Aesthetic direction agreed: refined minimalist light theme (editorial, money-trustworthy). Tooling: Tailwind CSS v4 with `@tailwindcss/vite`. No shadcn/ui or Radix — keep deps small.
- Phase 0: installed Tailwind v4.3.0 + `@tailwindcss/vite`, wired into `vite.config.js`, created `src/styles/tailwind.css` with `@theme` block (Fraunces serif + Inter body + JetBrains Mono for money; warm near-white surfaces; deep forest green `#1a3d2e` accent; tighter 4/6/8/12px radii). Rewrote `design-system.css` as a backwards-compat shim mapping legacy `--bg-primary` / `--primary` / `--text-main` etc. to the new light tokens, so unmigrated screens automatically render in the new palette without touching their files.
- Phase 1: built 9 reusable UI primitives at `src/components/ui/` (Button, Card, Input, Select, Textarea, Table, Badge, PageHeader, Tabs). All Tailwind-only, accept `className` for overrides, no per-primitive CSS modules.
- Phase 2 (screen migrations): Login, PendingApproval, Header, AppLayout, WeekHeader, Calendar, DayCard (week + month variants), MonthView, EmployeePeriodSummary, Charts, AdminDashboard shell, DayPayoutPanel, TeamManagement, AdminReportsPanel, ShiftEditorPanel. Each migration deleted the corresponding `.module.css` file when nothing else referenced it.
- Layout restructure (admin): replaced the wasteful left "Control Panel" with a thin sidebar (Shifts / Team / Reports nav items with icons + accent-soft active state) + sticky top app bar + PageHeader pattern. Date picker and Edit Shift moved into PageHeader actions. Sidebar collapses to horizontal tabs on `<lg` widths.
- Removed orphaned `BiweeklySummary` component (replaced by `EmployeePeriodSummary` in v0.3.0 per session notes).
- ShiftEditorPanel (1012 lines, the biggest one) fully Tailwind, including the printable team sheet via Tailwind's `print:` modifier. The drag-and-drop `ShiftSetupDnd` subcomponent and its `ShiftSetup.module.css` were intentionally left untouched — they render correctly via the shim and the drag interactions are sensitive enough that we deferred their migration to v0.8.0.
- PDF exports (`pdfExport.js`) updated: `PRIMARY_COLOR` from violet `#9333ea` → forest green `#1a3d2e`, soft tint from light violet → sage `#e8efe9`, so generated PDFs match the new on-screen theme.
- Verification at every stage: `npm run lint`, `npm test` (7/7), `npm run build` all pass. Browser-verified Login, employee dashboard (Header / WeekHeader / EmployeePeriodSummary / Calendar / Charts) at desktop, and AdminDashboard at desktop 1440×900 + mobile 375×812.
- Final diff: 45 files changed, +3,487 / −4,677 (net −1,190 lines, mostly from deleting ~3,100 lines of CSS modules).
- Committed as `296fce2 v0.7.0: Refined minimalist UI on Tailwind v4` and pushed to `origin/feature-ui-ux`. PR will be opened by the user against `develop` (or `main`) later.

### 2026-05-14 Handoff

- Branch: `foundation-stabilization`.
- App tested locally at `localhost:5173` and `localhost:5174` during the session.
- Current working tree has uncommitted changes in:
  - `docs/ROADMAP.md`
  - `src/components/Admin/AdminDashboard.module.css`
  - `src/components/Admin/ShiftEditorPanel.jsx`
  - `src/components/Admin/TeamManagement.jsx`
  - `src/components/Admin/TeamManagement.module.css`
- Completed the remaining `v0.4.0-user-management` decision: denied and inactive users keep their username mappings reserved so historical payout identity cannot be confused or reused by another account.
- Added Team Management copy explaining that inactive accounts keep usernames and payout history, and should be reactivated if the employee returns.
- Started `v0.5.0-admin-daily-workflow` because daily admin shift entry is more important right now than reports/PDF polish.
- Added live Pool Inputs totals for sales, CTP, gratuity, cash, covers, runner pay, bar transfer, contract gratuity, and per-team/per-bar mini totals.
- Added Runner Payout Review to Pool Inputs so runner amounts can be confirmed or adjusted from the money review screen.
- Split the old `Calculate & Save Shift` action into a safer two-step flow:
  - `Calculate Payouts`
  - review calculated employee payouts, role totals, available/distributed totals, runner pay, and balance
  - `Confirm & Save Shift`
- User confirmed the new calculator/pre-save payout review is working correctly and feels like a trust upgrade.
- Latest verification completed successfully:
  - `npm run lint`
  - `npm test`
  - `npm run build`
- Moved point adjustment controls from Team Setup into Pool Inputs. Team Setup assignment rows now only show assignment context, while Pool Inputs has a Point Adjustments panel for dining room and bar points before payout calculation.
- Verified after the point adjustment move:
  - `npm run lint`
  - `npm test`
  - `npm run build`
- Replaced the two-tab shift editor with a one-screen Shift Workspace: Team Floor Setup appears first, Money Closeout appears below it, and payout calculation/save still uses the same review flow.
- Added a `Print Team Sheet` action that prints a clean, black-and-white team assignment sheet generated from the current teams, bar team, and runners.
- Verified the one-screen workflow in the in-app browser at `http://127.0.0.1:5173/`; no browser console errors were reported.
- Reduced inline styling in `ShiftEditorPanel.jsx`, especially the contract controls inside money closeout, and removed stale tab styles from the admin dashboard CSS.
- Verified after the styling cleanup:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - In-app browser check at `http://localhost:5174/`
- Current recommendation: commit and push this batch after one final user review in the browser.

### 2026-05-07

- Initial codebase review completed.
- Decided to start with a foundation stabilization version.
- Created this roadmap to keep project direction persistent.
- Created `foundation-stabilization` branch.
- Updated app metadata to version `0.1.0`.
- Fixed lint errors and hook dependency warnings.
- Removed unused legacy plaintext-password auth service.
- Fixed admin detection in `BiweeklySummary`.
- Confirmed `npm run lint` and `npm run build` pass.
- Added Node test runner script with initial `calculateShift` coverage.
- Covered standard role-point payout, contract gratuity, bar pools, runner payouts, missing bar staff warnings, missing captain override balance, and rounding reconciliation.
- Confirmed `npm test`, `npm run lint`, and `npm run build` pass.
- Replaced public `users` reads for username lookup with a minimal public `usernames` mapping collection.
- Tightened `users/{uid}` reads to the profile owner or admins.
- Added a live tip-history subscription for employee dashboard data.
- Removed leftover debug logs from auth, admin shift loading, and tip saves.
- Started `v0.2.0-admin-workflow`.
- Split `AdminDashboard` into focused `DayPayoutPanel`, `ShiftEditorPanel`, and `AdminReportsPanel` modules.
- Added blocking pre-save validation for missing employees, missing money inputs, negative values, blank contract rows, and unbalanced engine results.
- Disabled shift saving while a save is already in progress.
- Clarified temporary staff creation and merge language in shift setup and team management.
- Started `v0.3.0-employee-dashboard`.
- Added a pay-period summary panel with total pay, worked shifts, average shift, best day, and source breakdown.
- Expanded employee day cards with role, formatted totals, and point details when saved shift data includes them.
- Tightened employee dashboard layout around tablet widths and replaced blank charts with an empty state when no payouts are available.
- Added a viewed-week total beside the pay-period total so employees can compare the current week against the full two-week pay period.
- Removed the duplicate financial summary from the employee dashboard now that earnings summary covers week and pay-period totals.
- Started `v0.4.0-user-management`.
- Inactive employee users now see an inactive-account message instead of the dashboard; admins route by role so legacy admin profiles are not locked out by missing status.
- Employee denial/deactivation now preserves account history instead of deleting only the Firestore profile.
- Improved shift editor team setup so assignment zones appear before the long employee list on smaller screens, with role filters and live assignment counts.
- Temporary staff merge targets now exclude active accounts that already have saved shift or tip history.
- Decided that inactive accounts keep their usernames reserved, and added Team Management copy explaining that reactivation should use the same profile.
- Started `v0.5.0-admin-daily-workflow`.
- Added a live shift totals panel to Pool Inputs so admins can review sales, CTP, gratuity, cash, covers, contract gratuity, and bar transfer before saving.
- Added runner payout review to Pool Inputs so runner pay can be confirmed or adjusted from the same screen used before saving.
- Split calculation and saving into a two-step flow so admins can review calculated employee payouts, role totals, and balance before saving the shift.
