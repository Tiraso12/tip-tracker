# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- Local development and validation are emulator-first. Use `docs/TESTING.md` for the authoritative Mac setup, `npm run dev:local` loop, `npm run test:all` gate, and `main`/`develop` branch model.
- Money rule, absolute: a payout `total` is CTP (charged tip) + GRT (gratuity) for EVERY role. Cash is always paid and reported separately and is never folded into a total. `getPayoutTotal` in `src/utils/payoutLedger.js` is the single definition - derive totals with it rather than trusting a stored `total`, because production ledger docs predate the rule. `reconcilePayoutLedger` balances the non-cash and cash sides separately; move money between them and the books stop balancing.
- Settled-shift money mutations go through the atomic batches in `src/utils/closeoutPersistence.js` (`saveClosedShiftAtomically` to settle/recalc, `removeShiftAtomically` to hard-delete a date). Each batch appends an `auditEvents` doc, and `firestore.rules` `validAuditEvent()` whitelists the allowed `type` values and keys - a new audit `type` or key must be added there too, or the whole batch is rejected with PERMISSION_DENIED.
- Every exit from `ShiftEditorPanel` must pass its leave guard. The panel hands one up through `onRegisterLeaveGuard`; `AdminDashboard` consults it before any tab switch (home control, workspace menu). Calling `setActiveTab` directly walks past the confirmation and silently discards an in-progress edit to a closed shift, whose changes never persist until Confirm & Save.
- To drive Playwright against an already-running `npm run dev:local` stack (rather than `npm run test:e2e`, which starts its own emulators and collides on the `firebase.json` ports): `FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx playwright test`. The specs clear Firestore and Auth, so re-seed after with those vars plus `GCLOUD_PROJECT=demo-tip-tracker-test node scripts/seed-emulators.mjs`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
