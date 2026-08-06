# Testing Setup

## Local Safety

TipTracker local development and tests should run against Firebase emulators with the demo project id `demo-tip-tracker-test`. Do not use production Firebase config for routine development or validation.

The committed `.env.test` file contains demo Firebase values and enables:

```bash
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIRESTORE_EMULATOR_PORT=8081
VITE_AUTH_EMULATOR_PORT=9099
```

Production `VITE_FIREBASE_*` values stay outside git. Use `.env.example` only as a template for required variable names.

## Mac Prerequisites

The Firestore emulator requires a local Java runtime. On this class of Mac, install OpenJDK and put it on the shell path:

```bash
brew install openjdk
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
```

Run `java -version` after exporting the path if Firebase Tools reports that Java is missing. Playwright may also need a browser install on a fresh machine:

```bash
npx playwright install chromium
```

## One-Command Local Loop

Run the app locally against Firebase Auth and Firestore emulators with seeded demo data:

```bash
npm run dev:local
```

This starts `firebase emulators:exec` for Auth and Firestore, runs `scripts/seed-emulators.mjs`, then starts Vite in test mode on `127.0.0.1`. The seed script refuses to run unless both emulator host variables are present and the Firebase project id starts with `demo-`.

Seeded local credentials:

```text
admin@example.com / Password123!
```

Seeded data includes active employees across roles, one pending user, one inactive user, one temporary staff profile, one setup draft shift, and one closed shift with per-user tip records.

## Commands

Run all source tests:

```bash
npm test
```

Run Firestore security rules tests:

```bash
npm run test:rules
```

Run the admin closeout browser tests:

```bash
npm run test:e2e
```

Run the full local check gate before merge:

```bash
npm run test:all
```

`test:all` chains source tests, Firestore rules tests, Playwright e2e tests, lint, and build. It is the local run-before-you-merge gate, not CI.

## Branching Model

- `main` is live production.
- `develop` is integration.
- Feature and bug-fix branches start from `develop`.
- Merge feature work back to `develop` after local emulator validation.
- Promote `develop` to `main` only after explicit approval.
- Deploy production only from a clean, approved `main`.

## What The Tests Cover

The Firestore rules tests cover:

- logged-out access boundaries
- employee access to only their own profile and tip records
- employee write denial for payouts, shifts, temporary staff, and role changes
- safe pending/unassigned self-registration defaults
- username mapping creation and overwrite protection
- admin access for user, shift, payout, and temporary staff operations

The first Playwright test covers:

- fake admin login through the UI
- selecting a shift date
- assigning employees to a dining team
- saving a setup draft
- entering closeout money
- calculating payouts
- confirming the closed shift
- verifying shift and employee tip documents in the emulator

The second Playwright test covers editing a closed, paid-out shift's roster:

- reopening a closed shift and confirming the closed-shift roster-edit warning
- asserting the bare Save Team Setup overwrite is not offered on a closed shift
- removing an employee and re-saving through Calculate Payouts, then Confirm & Save Shift
- verifying payouts, summary, and `closedAt` survive on the shift doc
- verifying the removed employee is absent from payouts and their stale tip doc is cleaned up
