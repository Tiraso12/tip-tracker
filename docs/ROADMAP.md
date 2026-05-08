# Tip Tracker Roadmap

This file is the shared project memory for Tip Tracker improvements. It keeps version goals, decisions, and checklists outside of chat so each work session can pick up cleanly.

## Current Version

- Version name: `v0.1.0-foundation`
- Branch: `foundation-stabilization`
- Status: Complete
- Started: 2026-05-07
- Goal: Stabilize the app before larger feature or visual changes, especially because the app handles real payout money.

## Version History

| Version | Name | Status | Goal |
| --- | --- | --- | --- |
| `v0.1.0` | Foundation | Complete | Clean baseline, protected payout math, safer auth/data flow |

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

- Split the large admin dashboard into smaller components.
- Improve shift editor validation and save feedback.
- Prevent accidental double saves.
- Make temporary/unregistered staff linking clearer.

### v0.3.0-employee-dashboard

- Show richer personal payout details.
- Add pay-period summaries.
- Improve empty states and mobile readability.
- Consider previous-period comparisons.

### v0.4.0-reports

- Improve weekly/monthly report accuracy.
- Make PDF formatting consistent.
- Add admin reports that summarize total earnings per employee for each selected week, month, or pay period.
- Review report export permissions.

### v1.0.0-stable-release

- All foundation checks pass.
- Core workflows are tested.
- Security rules are reviewed.
- Admin and employee experiences are polished enough for daily use.

## Session Notes

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
