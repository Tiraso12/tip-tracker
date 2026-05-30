# Tip Tracker Code State

Last reviewed: 2026-05-28

## Executive Summary

Tip Tracker is in a stable, production-oriented state. The codebase is a focused React/Vite/Firebase application with a clear split between employee-facing payout history and admin-facing shift operations. The critical payout math lives in a pure utility module with unit tests, while Firestore rules and the auth flow now reflect the security-hardening work described in the roadmap.

The app currently builds, lints, and passes its unit test suite. The main functional caution is not correctness of the tested paths, but operational maturity: there is no Firestore emulator/integration test setup, no backend functions for privileged admin work, and the production bundle has a large main chunk.

## Current Product Shape

The application supports two primary roles:

- Employees log in, view weekly/monthly payout history, period summaries, calendars, and charts from their own `users/{uid}/tips` records.
- Admins manage staff, build shift teams, enter closeout money, calculate payouts, save closed shifts, and generate PDF reports.

The live app and roadmap identify the project as released and deployed to Firebase Hosting, with `v1.1.0` security hardening marked complete.

## Tech Stack

- React 19 with Vite 7
- Firebase Authentication and Firestore
- Tailwind CSS v4 with local design tokens
- jsPDF and jsPDF-AutoTable for exports
- Recharts for charts
- Node's built-in test runner for utility tests
- ESLint 9 flat config

## Architecture Snapshot

The code is organized by feature and responsibility:

- `src/App.jsx` routes the logged-in user into either the admin dashboard, pending approval screen, login flow, or employee dashboard.
- `src/context/AuthContext.jsx` owns Firebase session state, username login, registration, pending approval status, and logout.
- `src/services/dataService.js` handles employee tip reads/subscriptions for the employee dashboard.
- `src/components/Admin/` contains the admin dashboard, shift editor, reports, team management, and shift setup UI.
- `src/utils/engine.js` is the core payout calculation engine. It is UI-independent.
- `src/utils/shiftPersistence.js` builds Firestore payloads for setup drafts and closed shifts.
- `src/utils/pdfExport.js` contains report and team-sheet PDF generation.
- `firestore.rules` defines the client-side security boundary.

This is a good shape for the current app size. The money logic is separated from React, and the admin UI is modular enough to understand without a broad rewrite.

## Core Data Flow

For employees:

1. Firebase auth resolves a user profile from `users/{uid}`.
2. `DataService.setUserId()` points reads at the current employee.
3. The app subscribes to `users/{uid}/tips`.
4. Calendar, charts, and period summaries derive their data from those records.

For admins:

1. Admin selects a shift date in `AdminDashboard`.
2. `ShiftEditorPanel` loads `shifts/{date}` if it exists.
3. Admin assigns employees to dining teams, bar, or runners.
4. Admin may save a setup draft to `shifts/{date}`.
5. Admin enters sales/tips/gratuity/cash/contracts and calculates payouts.
6. `calculateShift()` returns allocations, payouts, warnings, and balance checks.
7. Confirming save writes a closed shift to `shifts/{date}` and per-user tip records to `users/{uid}/tips/{date}`.
8. Removed employees from a recalculated shift have that date's tip record deleted.

## What Looks Solid

- The payout engine is pure JavaScript and has no UI or Firebase dependency.
- The engine covers role points, bar allocations, contract gratuity, runner pay, captain overrides, rounding reconciliation, and balance checks.
- The save flow stores both the full closed shift and the employee-facing tip records.
- Recalculated shifts clean up removed employee payouts.
- Admin and employee access paths are clearly separated at the React level.
- Firestore rules prevent basic self-elevation during signup and keep employee tip writes admin-only.
- Username login uses a separate `usernames/{normalizedUsername}` mapping instead of exposing full user profiles publicly.
- The UI has a consistent local design system and Tailwind token setup.

## Known Limitations And Risks

- `captainOverrideCTP` is still carved out when no captain is assigned. This is documented in `docs/ROADMAP.md` and covered by a test as a known limitation.
- Drag-and-drop shift setup has no touch support; mobile users rely on the click-to-assign flow.
- Firestore behavior is not covered by emulator or integration tests. Rules and client write flows are currently verified by inspection, not automated integration coverage.
- Most tests target utility logic. The React workflows, auth state transitions, PDF exports, and Firestore save paths do not have automated UI/integration coverage.
- Admin operations are client-side SDK operations. There are no backend functions for stronger server-side enforcement, user deletion, bulk exports, or audited privileged operations.
- Registration can create a Firebase Auth user before the Firestore batch succeeds; the code attempts cleanup, but failed client-side deletion remains an operational edge case.
- The app imports Google Fonts directly from CSS, so visual rendering depends on network font availability.
- Production build emits a large main chunk above Vite's default warning threshold.

## Verification Run

Commands run during this review:

```bash
npm test
npm run lint
npm run build
```

Results:

- Unit tests: 11 passed, 0 failed.
- Lint: passed.
- Production build: passed.
- Build warning: `dist/assets/index-BkkUjeUx.js` is about 1,039.80 kB minified, above the 500 kB chunk warning threshold.

## Recommended Next Steps

1. Add Firestore emulator tests for the security rules and the admin save flow.
2. Add engine coverage for the no-captain captain-override limitation before fixing it.
3. Add at least one end-to-end or component-level test for the shift closeout workflow.
4. Code-split heavy admin/report/PDF paths so employee dashboard users do not pay the full bundle cost upfront.
5. Consider backend functions for sensitive admin operations and account cleanup.
6. Add CSV export or reporting improvements only after the current save/security paths are covered by integration tests.

## Overall Assessment

The code is in a healthy released-app state: understandable, scoped, and currently passing checks. The most important domain logic is isolated and tested. The next phase should be less about reorganizing React components and more about hardening boundaries around Firestore, improving automated coverage for real workflows, and trimming the production bundle.
