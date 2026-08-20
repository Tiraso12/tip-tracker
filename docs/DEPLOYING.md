# Before you change production data

This project has no deploy procedure written down, and this document does not invent one. It records
the two captain-run steps that are invisible from the outside and expensive to skip: a live backup
before any payroll mutation, then the user profile name backfill before the rules go out.

## Take a live backup first

Name backfill and payout-ledger migration are one-way writes against real pay records. There is no
in-app undo. A screenshot, a dry-run log, and a git tag cannot put the old documents back. The save
point is a point-in-time export of production, taken **before** either mutation.

```bash
TIP_TRACKER_ALLOW_LIVE_MIGRATION=true TIP_TRACKER_BACKUP_BUCKET=<locked-backup-bucket> npm run backup:live
```

That command exports the whole production Firestore (every collection and subcollection) to a
timestamped path in the locked bucket, and writes a dated Firebase Auth user JSON under `backups/`
in this repo. It prints the Firestore URI, the Auth file path, and the timestamp when it finishes.

It refuses the emulator, refuses a demo project, and refuses to run without
`TIP_TRACKER_ALLOW_LIVE_MIGRATION=true`. It does not restore, migrate, backfill names, deploy
hosting, or deploy rules.

The bucket is not created for you. If `gcloud` is missing, or the bucket does not exist, the script
stops and prints the next step. Do not point `TIP_TRACKER_BACKUP_BUCKET` at the public Firebase app
bucket.

Save the printed path and timestamp with the dry-run output of whatever you run next.

## The name backfill is still manual

**Before deploying `firestore.rules` to a project whose rules require a non-empty `firstName`, run
the user profile name backfill against that project: dry run, captain reads, then apply.**

It is a one-time fix per project, and it must land **before** the rules do. Nothing runs it for you.
Do not run it until the live backup above has printed its path and timestamp.

## Why skipping it breaks settle up

`validUserProfile()` in `firestore.rules` requires `firstName` to be a string of 1 to 80 characters,
and that check applies on **update**, not just on account creation. Firestore validates the **merged**
document, so the rule is evaluated against the whole profile every time any field on it is written.

Settling up writes to every participant's user document - `closeoutPersistence.js` sets the shift and
tip history flags - and it does so in one atomic batch. A batch fails whole. So a single legacy
profile whose `firstName` is missing, empty, or blank makes **every shift that person worked
unsaveable**, for everyone, permanently, until that profile is fixed.

What that looks like in the restaurant: nobody is locked out and nothing looks wrong until closing
time, when the night will not save. It is a save failure at settle up, at 1am, on money that has
already been counted, and the cause is a profile field nobody has looked at in months. The failure
message on screen carries the raw error (`describeSaveFailure` in `src/utils/saveFailure.js`), but it
will not tell you which person is at fault.

This is why the order matters and not just the doing. Deploying the rules first and backfilling after
leaves a window - however short - in which the restaurant cannot close a night.

## Running it

Dry run first. It writes nothing and prints the whole plan:

```bash
npm run backfill:user-profile-names
```

Against the live project it refuses to run unless you say so explicitly:

```bash
TIP_TRACKER_ALLOW_LIVE_MIGRATION=true npm run backfill:user-profile-names
```

Read the output before going further. It leads with four numbers - scanned, will change, already
valid, cannot fix here - then lists every profile it will write and the exact value it will set, then
every profile it **cannot** fix and why.

**The "cannot fix here" list is the part that needs you.** (The judgment behind it is
`planUserProfileNameBackfill` in `src/utils/userProfileNameBackfill.js`.) The script copies a
person's existing username into `firstName` (the restaurant's policy: their real name can be
corrected later), so a profile with no username, or one over the 80 character cap, has nothing to
copy. It will not invent or truncate a name - a made-up or mangled first name reads as legitimate
and would never be corrected. Give each of those people a first name by hand in the Firebase
console, then run the dry run again.

While anything is on that list the script writes **nothing at all** and exits non-zero. A partial run
would report success while those profiles still blocked their shifts.

When the list is empty and the planned writes look right:

```bash
TIP_TRACKER_ALLOW_LIVE_MIGRATION=true npm run backfill:user-profile-names -- --apply
```

It re-reads every profile afterwards and fails if anything is still unfixed. Then deploy the rules.

To see the shape of the output first, against the emulator, where it cannot touch anything real:

```bash
npx firebase emulators:exec --project demo-tip-tracker-test --only firestore,auth \
  "node scripts/seed-emulators.mjs && npm run backfill:user-profile-names"
```

The seeded world is deliberately healthy, so that run reports every profile already valid and changes
nothing. It shows you the report, not a real fix. Only the live dry run tells you what is actually
blocked.

## Do not automate this

Not a predeploy hook in `firebase.json`, not a deploy script, not CI. This is a deliberate decision by
the captain, not an unfinished piece of work.

A hook would turn a one-time supervised fix into a **production data mutation that fires on every
future deploy**, unattended, writing to real people's records with nobody reading the plan. The whole
value of the dry run is that a person looks at the "cannot fix here" list and decides. An automated
run has no one to decide, and its most likely failure - refusing to write and failing the deploy - is
a worse outcome than the problem it was added to prevent.

The live backup is the same kind of command: captain-run, once, immediately before the first
mutation. It is not a predeploy hook either.

Run the backfill by hand, once, immediately before the rules go out.
