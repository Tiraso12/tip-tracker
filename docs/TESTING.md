# Testing Setup

## Local Safety

Tip Tracker local development and tests should run against Firebase emulators with the demo project id `demo-tip-tracker-test`. Do not use production Firebase config for routine development or validation.

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

The seed prints every login it created, one per access tier, and they all share the password `Password123!`. Read that block rather than a copy here - `scripts/seed-emulators.mjs` is what defines them.

Seeded data includes active employees across roles, a manager named by the `restaurant/config` pointer, captains with the Supervisor switch on and off, one pending user, one inactive user, one temporary staff profile, one setup draft shift, one closed shift with per-user tip records, and a worked fortnight ending yesterday so every paid account opens on a real pay statement.

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

### Running Alongside Another Worktree

The default ports (vite 5173, firestore 8081, auth 9099, emulator hub 4400) are
global, so a second checkout running `npm run dev:local` blocks `test:e2e` here.
To run the suite anyway, point every layer at free ports:

- a `firebase.json` copy with different `firestore`, `auth`, `hub`, and `logging`
  ports, passed via `firebase emulators:exec --config`
- a `playwright.config.js` copy with a different `baseURL` and a `webServer`
  command of `npm run dev:test -- --port <port> --strictPort`
- `VITE_FIRESTORE_EMULATOR_PORT` and `VITE_AUTH_EMULATOR_PORT` exported so the
  app connects to the alternate emulators

The specs themselves need no edits: `initializeTestEnvironment` discovers
Firestore through the `FIREBASE_EMULATOR_HUB` that `emulators:exec` exports, and
the auth REST calls read `FIREBASE_AUTH_EMULATOR_HOST`.

## Branching Model

- `main` is live production.
- `develop` is integration.
- Feature and bug-fix branches start from `develop`.
- Merge feature work back to `develop` after local emulator validation.
- Promote `develop` to `main` only after explicit approval.
- Deploy production only from a clean, approved `main`.

## What The Tests Cover

Each suite states its own scope; read the file rather than a list here, which only goes stale.

Firestore rules (`tests/rules/`), one emulator, one `projectId` per file:

- `firestore.rules.test.js` - logged-out boundaries, own-profile and own-tips access, write denial, self-registration defaults, username mapping
- `current-state.test.js` - production today: `role: "admin"` is the only live authority while no manager pointer exists
- `manager-tier.test.js` - both authorities live at once once a manager is named
- `profile-self-service.test.js` - the field-scoped writes a person may make to their own profile

Playwright (`tests/e2e/`), each driving the real UI against the emulators:

- `admin-closeout.spec.js` - the day's Floor plan → Settle up → Review flow, the money on Review, and editing a settled shift
- `admin-pending-approvals.spec.js` - the approval flow and the app-bar count
- `admin-temp-merge.spec.js` - merging a temporary profile, including the per-date collision block
- `manager-tier.spec.js` - what each tier meets on screen, the Supervisor switch, and "THE COUPLING" between the app's two halves
- `profile-account.spec.js` - account self-service and name changes
