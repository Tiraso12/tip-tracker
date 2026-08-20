# Data Persistence

Technical detail behind the write paths that mutate settled-shift money and staff identity.
For the manager-facing merge workflow (not the implementation), see
[MANAGING-TEMPORARY-STAFF.md](MANAGING-TEMPORARY-STAFF.md).

## Settled-shift money mutations

Settled-shift money mutations go through the atomic batches in
`src/utils/closeoutPersistence.js` (`saveClosedShiftAtomically` to settle/recalc,
`removeShiftAtomically` to hard-delete a date). Each batch appends an `auditEvents` doc, and
`firestore.rules` `validAuditEvent()` whitelists the allowed `type` values and keys - a new audit
`type` or key must be added there too, or the whole batch is rejected with PERMISSION_DENIED.

A date can legitimately hold `payouts/{date}/entries/*` with **no** `shifts/{date}` doc -
`migrate:payout-ledger` writes ledger entries and never shift docs, and an unfinished write
leaves the same shape. The day landing surfaces that as its own `orphaned-payouts` stage
(`src/utils/dayFlow.js`) so the same removal batch cleans it up; a date with neither is still the
blank build-floor day.

Discarding an accidental setup-stage day (wrong date, touch the floor, autosave, no saved pay) is
a separate path: `removeSetupShiftAtomically`, captain work, control on the Floor step
(`FloorStep.jsx`). Do not fold it into the manager-only settled danger zone.

## Merging a temporary staff profile

Merging a temporary staff profile (`src/utils/tempStaffMergePersistence.js`) deletes that
profile, so it must first find **every** reference to the temp UID, not just the paid ones.
Discovery is three bounded reads: the canonical ledger, the legacy tip docs, and a
`status == "setup"` query for open floor plans (`discoverUnsettledShiftDates`) - a full `shifts`
scan is not acceptable, and an unsettled night that keeps the temp UID pays a deleted profile
when it settles.

The collision block is **per date and all-or-nothing** and runs before any write: an account
with unrelated history merges fine, one clashing date stops every date. A date already stamped
`mergedFromTempStaff.uid` for this same temp profile is a resume, not a clash - skip the
overwrite and keep going. After that check, writes go in 12-date pieces
(`MERGE_DATES_PER_CHUNK`); the temp profile is deleted only when every piece has finished.
Roster-only dates never create a collision. Older docs saying "any history blocks a merge
forever" are superseded.
