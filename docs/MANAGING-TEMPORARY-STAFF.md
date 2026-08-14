# Managing Temporary Staff Profiles

For managers. No technical knowledge needed.

## What a temporary staff profile is

When someone works a shift before they have an account in the app, you add them during
shift setup with **+ Add Temporary Staff**. They get a temporary profile: a name and a
role, enough for the tip pool to count them in and pay everybody accurately.

Their shifts and payouts are saved under that temporary profile, not under a real account.

## The one thing to get right

**Merge the temporary profile into the employee's real account as soon as that account is
approved - before the employee starts working shifts under their own login.**

Do it right at approval time, not at the end of the week and not at the end of the pay
period. Every night they work while both a temporary profile and a real account exist for
them is a night that can permanently block the merge.

## How to merge

1. Open **Team** from the account menu. That is the team roster: a search box, status
   filters, and one row per person. Tapping a row opens that person.
2. If you have not approved the employee's sign-up yet, filter to **Pending**, open them,
   give them a job title, and tap **Approve account**. They have to be an active employee
   before they can be a merge target.
3. Search for the temporary profile by name and open it. Its row is tagged **Temp**.
4. Under **Temporary profile**, pick their real account in **Real employee account**.
5. Tap **Merge profile** and confirm.

The merge moves their saved shifts and tip history onto the real account and removes the
temporary profile. Nights that are still open - a floor plan built but not settled up - are
switched over to the real account too, because the temporary profile is about to stop
existing and a night that still named it would pay nobody when you settled it.

Read what the app tells you when it finishes. Usually it lists the dates that moved and you
are done. Once in a while it says **Merge incomplete**: the temporary profile was removed but
one or more floor plans still name it. Those dates are listed, and you have to open each one
and put the real account on the floor **before you settle up that night**. It is a minute of
work; skipping it means that night's payout goes to a profile that is gone.

You can then keep assigning them to shifts under their real account.

## What can block the merge

The merge stops if the employee has a saved payout on the **same date** under both their
temporary profile and their real account. That happens when the same night was recorded
twice for the same person - once as temp staff, once under their own account.

You will see:

> Merge stopped. The target account already has saved payout history on <dates>. No records
> were changed.

Nothing is damaged and nothing is lost. The app refuses on purpose: writing the temporary
payout onto a date the real account already has would quietly overwrite a payout the
employee may already have been paid on.

It is all or nothing. If even one date conflicts, none of the temporary history moves over,
including the dates that would have been fine.

Older history on unrelated dates is not a problem by itself. An employee can already have
weeks of shifts under their own account and the merge will still go through, as long as none
of those dates overlap with a date on the temporary profile.

## If a merge is blocked

- **Leave it.** The old temporary history stays where it is. It is still visible in past
  shifts under the temporary name, and past payouts stay correct as they were paid.
- **Re-enter it by hand.** If the employee's real account needs those older numbers, add
  them to the relevant shifts manually.
- **Delete the temporary profile** once you no longer need it in shift setup. Past shifts
  keep the saved name, so old records still read correctly.

## Rules of thumb

- One temporary profile per person. Do not create a second one for the same person on a
  later night - reuse the existing one so all their history stays together.
- Approve, then merge, then let them log in. That order avoids the problem entirely.
- Never assign the same person twice on one night, once as temp staff and once under their
  real account. That is exactly the conflict that blocks the merge.
