// This plan exists to satisfy `validUserProfile()` in firestore.rules, so it
// judges a profile against what those rules actually accept, not against
// whether a field happens to exist. The rules demand a firstName that is a
// string of 1..80 characters and a lastName that is a string of 0..80, and
// Firestore validates the MERGED document on update - so a profile carrying
// `firstName: ""` is every bit as blocking as one carrying no firstName at
// all, and reporting it as "already present" is the silent failure this
// module is here to prevent.
const MAX_NAME_LENGTH = 80;

// The rules count characters; JS `.length` counts UTF-16 code units, which is
// never fewer. Measuring with `.length` can therefore only ever be stricter
// than the rules, so a value that fits here always fits there.
function nameLength(value) {
    return value.length;
}

// A value the rules would reject, or that is only whitespace, is not a name.
function isBlank(value) {
    return typeof value !== "string" || value.trim().length === 0;
}

export function planUserProfileNameBackfill(users = []) {
    const writes = [];
    const skipped = [];
    const invalid = [];

    users.forEach((user) => {
        const data = user?.data || {};
        const reasons = [];
        const fields = {};

        const firstName = typeof data.firstName === "string" ? data.firstName : null;
        const lastName = typeof data.lastName === "string" ? data.lastName : null;

        if (firstName !== null && !isBlank(firstName)) {
            // Already a real name. It still has to fit, and we cannot shorten
            // somebody's name for them, so an over-long one needs a person.
            if (nameLength(firstName) > MAX_NAME_LENGTH) {
                reasons.push(
                    `firstName is ${nameLength(firstName)} characters; the rules cap it at ${MAX_NAME_LENGTH}`,
                );
            }
        } else {
            const username = typeof data.username === "string" ? data.username.trim() : "";
            if (!username) {
                reasons.push("missing username for firstName backfill");
            } else if (nameLength(username) > MAX_NAME_LENGTH) {
                // Truncating would write a mangled string that reads like a
                // real name and so would never be corrected. Report instead.
                reasons.push(
                    `username is ${nameLength(username)} characters; firstName is capped at ${MAX_NAME_LENGTH}`,
                );
            } else {
                fields.firstName = username;
            }
        }

        if (lastName === null || (isBlank(lastName) && lastName !== "")) {
            // The rules accept an empty lastName, so "" is the honest value for
            // a surname nobody recorded. Writing it only when it differs keeps
            // the backfill idempotent.
            fields.lastName = "";
        } else if (nameLength(lastName) > MAX_NAME_LENGTH) {
            reasons.push(
                `lastName is ${nameLength(lastName)} characters; the rules cap it at ${MAX_NAME_LENGTH}`,
            );
        }

        if (reasons.length > 0) {
            // Nothing is written for a profile we cannot fully fix: the merged
            // document would still be rejected, so a partial write buys nothing
            // and hides the profile from the next run's report.
            invalid.push({ id: user.id, reason: reasons.join("; ") });
            return;
        }

        if (Object.keys(fields).length === 0) {
            skipped.push(user.id);
            return;
        }

        writes.push({ id: user.id, data: fields });
    });

    return {
        writes,
        skipped,
        invalid,
        counts: {
            scanned: users.length,
            changed: writes.length,
            skipped: skipped.length,
            invalid: invalid.length,
        },
    };
}
