# Naming the manager - the production changeover

This is the exact procedure for making the manager tier live in the production restaurant. It is one
document write. Follow it top to bottom; nothing here needs to be re-derived on the day.

Read the two consequences below before you start. They are the whole reason this has an order.

> **Run it when no shift is in progress. Never mid-service.**
>
> **Turn Supervisor ON for the people who need it before the next service starts.**
>
> Existing captains start with the Supervisor switch OFF, by the captain's own decision. Until the
> manager turns it on for someone, **nobody but the manager can enter money or build a floor plan.**
> A changeover that lands mid-service with every switch still off leaves the restaurant unable to
> settle up that night. That is the single most expensive mistake available here, and the only one
> this procedure can actually cause.
>
> The order still holds while the app routes nobody new (see the next section): do it between
> services and set the switches, so that whenever the screens do follow, the ground is already
> prepared and no service is ever the first to find out.

## The routing gate - read this before planning a go-live

**The manager pointer changes what people are ALLOWED to do. It does not yet change what they SEE.**

`src/App.jsx` still decides who gets the shift workspace with the legacy `role === "admin"` test. So
after this procedure the manager and every Supervisor-on captain genuinely hold their new server-side
access - they can be proved to hold it - but they still land on their own pay screen, and today's
admin is still the only person who sees the workspace.

That is deliberate and it is safe in this direction. Permission without a screen routed to it is
inert. The reverse is what breaks people.

**Moving the gate is a separate change, and it must land together with a captain's route back to
their own pay.** The employee side has no navigation at all - `Header.jsx` is an eyebrow, a title and
Log Out - so the moment the gate sends a captain to the workspace, their own pay view is gone with no
way back. A captain is a paid member of the tip pool. **The first person the manager gives Supervisor
to would silently lose their week.** This was proved in a running app, not theorised. The shape of
that entry is an open question for the captain.

Two tests in `tests/e2e/manager-tier.spec.js`, under "THE COUPLING", fail if the gate is moved on its
own. Do not route around them. If a go-live plan says "the manager pointer is written, so captains can
now run the night from their phones", that plan is wrong until the pay entry ships.

## What this does and does not do

The pointer `restaurant/config.managerUid` names exactly one person as the manager. Writing it is the
**only** step that makes the tier live.

- It **takes nothing from anyone.** The legacy `role: "admin"` authority stays in `firestore.rules`
  and keeps working alongside the pointer. The account that runs the restaurant today runs it
  identically the minute after.
- It **gives nobody anything either**, on its own. The captain tier comes from a separate per-person
  switch, `users.isSupervisor`, which is off for everybody until the manager turns it on.
- It does **not** retire `role: "admin"`, and it does **not** put the manager on the roster or in the
  pay maths. The manager oversees; they do not work a section and take no share of the pool. Those
  are later, separate steps, and the irreversible one can wait weeks.

`src/utils/permissions.js` names every capability and which tier holds it. `firestore.rules` enforces
the same split on the server. `tests/rules/manager-tier.test.js` proves both authorities work at once,
including the exact post-changeover state, and `tests/e2e/manager-tier.spec.js` proves what each tier
sees on screen.

## Before the day

Decide two things and write them down:

1. **Who the manager is.** One person. Their tier will come from the pointer alone, so it does not
   matter what job title their profile carries.
2. **Who needs Supervisor on for the next service.** Every captain who will enter money, build a floor
   plan, or correct a settled day that night. If you are not sure, list everyone who has ever settled
   up. Turning it on is reversible in one tap; discovering the list at 8pm is not recoverable.

## Step 1 - inventory, read-only

Confirm the restaurant is still in the state this procedure assumes: exactly one `role: "admin"`
account, and it is the person who is becoming the manager.

Firebase console → **Firestore Database** → **Query builder** (or the collection view's filter):

- Collection: `users`
- Where: `role` `==` `admin`

Note the `uid` and `username` of every document returned, active or not.

- **Exactly one, and it is the intended manager** → continue. Nobody loses anything.
- **More than one** → **stop.** Every extra holder is a person whose powers change when the legacy
  clause is eventually dropped, and each one is a conversation to have before that release, not after.
  The changeover itself is still safe, but do not run it without knowing who is on that list.
- **The intended manager is not on the list** → continue anyway; the pointer does not require it. Just
  be certain their profile has `status: "active"`, or the tier will be dead on arrival.

Also note the **uid** of the person becoming the manager. It is the document id of their `users`
document, and it is the only value the next step needs.

## Step 2 - write the pointer

This is the changeover. One document, one field.

Firebase console → **Firestore Database** → **Start collection** (or **Add document** if `restaurant`
already exists):

- Collection id: `restaurant`
- Document id: `config`   ← exactly this, lowercase. No other document id is read.
- Field: `managerUid`, type **string**, value: the uid from step 1.
- Optionally add `updatedAt`, type **string**, value: today's date. Nothing reads it; it is a note to
  the next person.

Add no other fields. `firestore.rules` accepts only `managerUid` and `updatedAt` on later in-app
writes, so anything else here becomes a document the sitting manager can no longer edit.

**Why the console and not the app:** no client may create or delete this document - the rules refuse
it for everyone, the manager included. Only the sitting manager may retarget an existing pointer, and
that is the hand-over. Creating the first one is deliberately an out-of-band act, exactly like the way
the original admin account was created.

## Step 3 - verify, before anyone relies on it

1. Re-open `restaurant/config` in the console. One field, `managerUid`, the right uid.
2. Sign in as the admin account and open a settled day. Everything is exactly where it was: the
   floor plan, settle up, Team, and the Remove control. **This is the check that matters** - the
   whole promise of this release is that nothing shrinks for the person running the restaurant.
3. Sign in as anyone else. They see their own pay screen. That is correct and expected: see "The
   routing gate" above - nobody is re-routed by this procedure.

Do not expect the manager account to open a workspace unless it is also the admin account. If step 2
shows anything missing, the fastest fix is to reverse the change (below) and look again; the pointer
takes nothing from the admin, so a difference there means something else is wrong.

## Step 4 - turn Supervisor on, before the next service

Still the same afternoon, before anyone comes in for the night.

There is **no on-screen control for the switch yet** - where it lives is waiting on the roster
rebuild. Until it ships, set it the same way you wrote the pointer: for each person from the "before
the day" list, Firebase console → `users` → their document → add field `isSupervisor`, type
**boolean**, value **true**.

Absent or `false` both read as off. Nothing else on their profile changes; their job title and their
pay are untouched by this field, and a captain with the switch off is still paid exactly as a captain.

Only then does it matter that the tier is live.

## Reversing it

Every step here is reversible by writing the previous value back. Nothing in this procedure destroys
data.

- **To undo the changeover entirely:** delete the `restaurant/config` document in the console. The
  tier model goes dormant instantly - `isManager()` and `isCaptain()` are false for everyone again -
  and `role: "admin"` is once more the only authority, exactly as it is today. The console bypasses
  the rules that stop clients doing this, which is why it is the console's job.
- **To undo a hand-over** (the pointer already existed and was retargeted): write the previous uid
  back into `managerUid`. One field, one write, no intermediate state.
- **To undo a Supervisor grant:** set that person's `isSupervisor` to `false`, or delete the field.
  They keep their job title and their pay either way.

Undoing the changeover while leaving `isSupervisor: true` on people is harmless: the switch grants
nothing while there is no pointer. `tests/rules/current-state.test.js` pins that.

## The one gap, stated plainly

There is no break-glass path. With a single manager and manager-only hand-over, if that account is
ever deactivated, lost, or locked out, **the manager tier cannot be recovered from inside the app** -
nobody else can appoint a replacement. Recovery is a console write: point `managerUid` at someone
else, exactly as in step 2.

This is an accepted risk, not an oversight - the captain declined a backup manager, because a second
holder would break "exactly one". It is written here so that the recovery is this paragraph rather
than a panic.

## Doing it locally first

`npm run dev:local` seeds all of it: a manager named by the pointer, a Supervisor-on captain, a
Supervisor-off captain, and today's legacy admin who is deliberately *not* the manager. The logins are
printed when the seed runs. That is the same world this procedure creates, and it is the cheapest way
to see what each person will see before doing it for real.
