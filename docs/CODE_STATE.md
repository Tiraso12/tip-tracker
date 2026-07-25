# Tip Tracker Code State

Last reviewed: 2026-06-22

## Executive Summary

Tip Tracker is in a stable, production-oriented state. The codebase is a focused React/Vite/Firebase application with a clear split between employee-facing payout history and admin-facing shift operations. The critical payout math lives in a pure utility module with unit tests, while Firestore rules and the auth flow now reflect the security-hardening work described in the roadmap.

The app currently builds, lints, passes its unit test suite, passes Firestore rules tests, and has a Playwright/Firebase emulator test for the admin closeout workflow. The main functional caution is now operational maturity around privileged admin work: admin operations still run through the client SDK rather than backend functions.

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
- `src/services/dataService.js` handles scoped employee tip reads/subscriptions for the employee dashboard.
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
3. The app subscribes to only the date-key tip documents needed for the current employee view.
4. Calendar, charts, and period summaries derive their data from the in-memory range cache.

For admins:

1. Admin selects a shift date in `AdminDashboard`.
2. `ShiftEditorPanel` loads `shifts/{date}` if it exists.
3. Admin assigns employees to dining teams, bar, or runners.
4. Admin may save a setup draft to `shifts/{date}`.
5. Admin enters sales/tips/gratuity/cash/contracts and calculates payouts.
6. `calculateShift()` returns allocations, payouts, warnings, and balance checks.
7. Confirming save writes a closed shift to `shifts/{date}` and per-user tip records to `users/{uid}/tips/{date}`.
8. Removed employees from a recalculated shift have that date's tip record deleted.
9. Saved setups and closed shifts update user history flags used by Team Management merge safety checks.

## What Looks Solid

- The payout engine is pure JavaScript and has no UI or Firebase dependency.
- The engine covers role points, bar allocations, contract gratuity, runner pay, captain overrides, rounding reconciliation, and balance checks.
- The save flow stores both the full closed shift and the employee-facing tip records.
- Recalculated shifts clean up removed employee payouts.
- Admin and employee access paths are clearly separated at the React level.
- Firestore rules prevent basic self-elevation during signup and keep employee tip writes admin-only.
- Firestore rules and admin closeout behavior are covered by local Firebase emulator tests.
- Admin, chart, report, team management, and shift editor surfaces are lazy-loaded to reduce initial startup cost.
- Admin employee collection reads are deferred until an employee-dependent admin panel is opened.
- Employee tip subscriptions are scoped to the active pay period or visible month grid instead of full history.
- Team Management uses `hasTipHistory` and `hasShiftHistory` flags before falling back to legacy scans.
- Username login uses a separate `usernames/{normalizedUsername}` mapping instead of exposing full user profiles publicly.
- The UI has a consistent local design system and Tailwind token setup.

## Known Limitations And Risks

- `captainOverrideCTP` is still carved out when no captain is assigned. This is documented in `docs/ROADMAP.md` and covered by a test as a known limitation.
- Drag-and-drop shift setup has no touch support; mobile users rely on the click-to-assign flow.
- Most React workflows, auth state transitions, and PDF exports still do not have automated UI/integration coverage.
- Admin operations are client-side SDK operations. There are no backend functions for stronger server-side enforcement, user deletion, bulk exports, or audited privileged operations.
- Registration can create a Firebase Auth user before the Firestore batch succeeds; the code attempts cleanup, but failed client-side deletion remains an operational edge case.
- The app imports Google Fonts directly from CSS, so visual rendering depends on network font availability.
- Production build still emits a main chunk above Vite's default warning threshold, though heavy admin/chart/report/editor surfaces are split into lazy chunks.

## Verification Run

Commands run during this review:

```bash
npm test
npm run lint
npm run build
npm run test:rules
npm run test:e2e
```

Results:

- Unit tests: 26 passed, 0 failed.
- Lint: passed.
- Production build: passed.
- Firestore rules tests: 6 passed, 0 failed.
- Playwright/Firebase E2E: 1 passed, 0 failed.
- Build warning: main app chunk is about 579.53 kB minified / 178.59 kB gzip, above the 500 kB chunk warning threshold.

## Recommended Next Steps

1. Add engine coverage for the no-captain captain-override limitation before fixing it.
2. Add more Playwright coverage for Team Management, employee dashboard ranges, and auth state transitions.
3. Consider backend functions for sensitive admin operations and account cleanup.
4. Continue bundle work by manually chunking vendor-heavy PDF/chart dependencies if startup remains slow.
5. Add CSV export or reporting improvements after the current save/security paths stay covered by integration tests.

## Overall Assessment

The code is in a healthy released-app state: understandable, scoped, and currently passing checks. The most important domain logic is isolated and tested, and the highest-risk Firestore/admin closeout paths now have local emulator coverage. The next phase should focus on server-side hardening for privileged operations, deeper workflow coverage, and continued bundle trimming for mobile startup.
