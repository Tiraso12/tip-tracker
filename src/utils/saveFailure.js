// What Review says when Confirm & Save comes back with an error.
//
// Before this existed the whole on-screen explanation was "Failed to save." and the
// real diagnostic went to the browser console, where nobody settling a night at 2am
// is looking. Every branch below turns one machine failure into something the person
// holding the phone can act on, and the last branch still carries the raw text rather
// than swallowing an error nobody anticipated.

const clean = (value) => (typeof value === "string" ? value.trim() : "");

// Someone whose profile has no first name has, by definition, no name to show. Fall
// back through everything else the profile carries so the captain can still tell WHO
// to go and fix; a bare uid is the last resort and is still better than silence.
export function identifyProfile(person = {}) {
    return clean(person.lastName)
        || clean(person.username)
        || clean(person.email)
        || clean(person.uid)
        || "Unknown person";
}

// firestore.rules `validUserProfile()` requires a non-empty `firstName`, and the
// closeout batch updates every participant's user document - which Firestore
// evaluates as the MERGED document. So one nameless profile makes every shift that
// person worked unsaveable, and the batch fails as a whole with no clue whose fault
// it is. This finds them from data the editor already holds, so the failure can name
// them. `npm run backfill:user-profile-names -- --apply` is the bulk fix.
export function findNamelessParticipants({ participantUids = [], employees = [] } = {}) {
    const wanted = new Set(participantUids.filter(Boolean));

    return employees
        .filter(employee => wanted.has(employee?.uid) && !clean(employee?.firstName))
        .map(identifyProfile)
        .sort((a, b) => a.localeCompare(b));
}

export function describeSaveFailure(error, { namelessParticipants = [] } = {}) {
    const code = error?.code || "";
    const message = clean(error?.message);

    if (code === "permission-denied" && namelessParticipants.length > 0) {
        const people = namelessParticipants.length === 1 ? "one person on this shift has" : "these people have";
        return {
            headline: "The shift was refused because a profile has no first name.",
            body: `Nothing was saved: ${people} no first name on their account, and a shift cannot be saved while anyone on it is missing one. Add it under Team management, then Confirm & Save again.`,
            names: namelessParticipants,
        };
    }

    if (code === "permission-denied") {
        return {
            headline: "The shift was refused and nothing was saved.",
            body: "Your account may no longer be allowed to settle this day, or a profile on the shift is incomplete. Sign out and back in and try again; if it still refuses, the manager needs to look at the accounts on this shift.",
            names: [],
        };
    }

    if (code === "not-found") {
        return {
            headline: "Someone on this shift no longer has an account.",
            body: "Nothing was saved. An account that was on the Floor plan has since been deleted. Take that person off the Floor plan, or ask the manager to restore the account, then Confirm & Save again.",
            names: [],
        };
    }

    if (message.startsWith("Payout reconciliation failed")) {
        return {
            headline: "This shift's money does not balance, so nothing was saved.",
            body: "Every dollar entered at Settle up has to end up somewhere - with staff, the house or the door. Open Shift totals below to see the balance check.",
            names: [],
        };
    }

    return {
        headline: "The shift could not be saved.",
        body: "Nothing was written, so nothing typed is lost. Try again; if it keeps failing, this is what went wrong:",
        names: [],
        detail: message || String(error || "Unknown error"),
    };
}
