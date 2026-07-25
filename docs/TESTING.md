# Testing Setup

## Local Safety

The emulator and UI tests are designed to run against local Firebase emulators with the project id `demo-tip-tracker-test`. They do not use the production Firebase project, production users, production shifts, or production payout records.

## Commands

Run existing utility tests:

```bash
npm test
```

Run Firestore security rules tests:

```bash
npm run test:rules
```

Run the admin closeout browser test:

```bash
npm run test:e2e
```

## Prerequisites

The Firestore emulator requires a local Java runtime. Firebase Tools currently requires JDK 21 or newer. This workstation has a portable Temurin JDK 21 at:

```bash
C:\tmp\temurin21\jdk-21.0.11+10
```

`JAVA_HOME` has been set for the Windows user to that path. Open a new terminal if Firebase still picks up an older Java runtime.

Firestore emulator tests use port `8081` because port `8080` is already used by NVIDIA Broadcast on this machine.

Playwright may also need a browser install on a fresh machine:

```bash
npx playwright install chromium
```

## What The New Tests Cover

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
