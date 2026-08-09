# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- Local development and validation are emulator-first. Use `docs/TESTING.md` for the authoritative Mac setup, `npm run dev:local` loop, `npm run test:all` gate, and `main`/`develop` branch model.
- Settled-shift money mutations go through the atomic batches in `src/utils/closeoutPersistence.js` (`saveClosedShiftAtomically` to settle/recalc, `removeShiftAtomically` to hard-delete a date). Each batch appends an `auditEvents` doc, and `firestore.rules` `validAuditEvent()` whitelists the allowed `type` values and keys - a new audit `type` or key must be added there too, or the whole batch is rejected with PERMISSION_DENIED.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
