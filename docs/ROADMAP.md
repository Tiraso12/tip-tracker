# Tip Tracker Roadmap

This file is the shared project memory for Tip Tracker improvements. It keeps version goals, decisions, and checklists outside of chat so each work session can pick up cleanly.

## Current Version

- Version name: `v0.5.0-admin-daily-workflow`
- Branch: `foundation-stabilization`
- Status: Ready for review
- Started: 2026-05-07
- Goal: Make daily shift input clearer before deeper report/PDF work.
- Current working state: Uncommitted local changes are present and verified.

## Version History

| Version | Name | Status | Goal |
| --- | --- | --- | --- |
| `v0.1.0` | Foundation | Complete | Clean baseline, protected payout math, safer auth/data flow |
| `v0.2.0` | Admin Workflow | Complete | Smaller admin modules, better shift validation, safer saves |
| `v0.3.0` | Employee Dashboard | Complete | Richer employee earnings summaries and clearer weekly/pay-period totals |
| `v0.4.0` | User Management | Complete | Safer account status handling, temporary staff merge rules, better team setup |
| `v0.5.0` | Admin Daily Workflow | Ready for review | One-screen shift workspace, live closeout totals, and safer payout review |

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

- Status: Ready for review
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

Recommended next step: do one final manual browser pass, then commit and push the v0.4/v0.5 batch with the roadmap. After that, start `v0.6.0-reports`.

### v0.6.0-reports

- Improve weekly/monthly report accuracy.
- Make PDF formatting consistent.
- Add admin reports that summarize total earnings per employee for each selected week, month, or pay period.
- Review report export permissions.

### v1.0.0-stable-release

- All foundation checks pass.
- Core workflows are tested.
- Security rules are reviewed.
- Admin and employee experiences are polished enough for daily use.

### Later Ideas

- Previous-period comparisons for employee dashboard trends.

## Session Notes

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
