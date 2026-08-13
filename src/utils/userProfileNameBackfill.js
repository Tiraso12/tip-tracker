export function planUserProfileNameBackfill(users = []) {
    const writes = [];
    const skipped = [];
    const invalid = [];

    users.forEach((user) => {
        const data = user?.data || {};
        const firstNamePresent = typeof data.firstName === "string";
        const lastNamePresent = typeof data.lastName === "string";

        if (firstNamePresent && lastNamePresent) {
            skipped.push(user.id);
            return;
        }

        const username = typeof data.username === "string" ? data.username.trim() : "";
        if (!firstNamePresent && !username) {
            invalid.push({ id: user.id, reason: "missing username for firstName backfill" });
            return;
        }

        writes.push({
            id: user.id,
            data: {
                ...(!firstNamePresent ? { firstName: data.username } : {}),
                ...(!lastNamePresent ? { lastName: "" } : {}),
            },
        });
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
