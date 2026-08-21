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

Run the browser tests:

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
- `E2E_PORT`, `PLAYWRIGHT_BASE_URL`, and `E2E_WEB_SERVER_COMMAND` exported so
  Playwright starts and checks Vite on the alternate port, for example
  `E2E_WEB_SERVER_COMMAND='npm run dev:test -- --port 5183 --strictPort'`
- `VITE_FIRESTORE_EMULATOR_PORT` and `VITE_AUTH_EMULATOR_PORT` exported so the
  app connects to the alternate emulators

The specs themselves need no edits: `initializeTestEnvironment` discovers
Firestore through the `FIREBASE_EMULATOR_HUB` that `emulators:exec` exports, and
the auth REST calls read `FIREBASE_AUTH_EMULATOR_HOST`.

### Driving Playwright Against An Already-Running Stack

`npm run test:e2e` starts its own emulators and collides on the `firebase.json` ports with an
already-running `npm run dev:local`. To drive Playwright against that running stack instead:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx playwright test
```

The specs clear Firestore and Auth, so re-seed after with those same vars plus:

```bash
GCLOUD_PROJECT=demo-tip-tracker-test node scripts/seed-emulators.mjs
```

### The `.env.test.local` Trap

If every e2e test fails at login with "network request failed", look for a gitignored
`.env.test.local`: it overrides `.env.test`'s emulator ports and outlives the session that wrote
it in a reused worktree.

## Branching Model

- `main` is the integration branch and the production line.
- Feature and bug-fix branches start from `main`.
- Merge feature work back to `main` after local emulator validation (`npm run test:all`).
- `develop` is no longer the integration branch. Do not branch from it or merge to it.
- Deploy production only from a clean, approved `main`.
- The default ship path is `no-mistakes`; yolo stays off. PRs target `main`. Do not merge your own PR.

## What The Tests Cover

Every suite states its own scope in a header comment at the top of the file. Read that rather than a
list here, which only goes stale. Where they live:

- `src/**/*.test.js` - unit tests next to the code they cover. No emulator, no browser.
- `tests/rules/` - what `firestore.rules` grants and refuses, against the Firestore emulator.
- `tests/e2e/` - Playwright driving the real UI against the Auth and Firestore emulators.

Two constraints no single file can show you:

- The rules suites run in parallel against **one** emulator, and `clearFirestore()` is scoped to a
  project. Every suite file therefore needs its own `projectId`, or two suites wipe each other's
  fixtures mid-run and fail in ways that look like rules bugs.
- The tier suites come in pairs by design: one runs with no `restaurant/config` document, to pin what
  production grants today, and its counterpart seeds the pointer to prove the tiers. Both authorities
  are live at once on purpose, so neither half can be dropped while the changeover is unfinished.
