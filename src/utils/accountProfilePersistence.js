import { doc, FieldPath, writeBatch } from "firebase/firestore";
import { discoverUnsettledShiftDates } from "./tempStaffMergePersistence.js";

export const MAX_PROFILE_NAME_LENGTH = 80;
export const MAX_LOGIN_HANDLE_LENGTH = 80;

export function cleanProfileNamePart(value) {
    return typeof value === "string" ? value.trim() : "";
}

export function normalizeLoginHandle(value) {
    return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

export function validateWorkName(firstName, lastName) {
    const cleanFirstName = cleanProfileNamePart(firstName);
    const cleanLastName = cleanProfileNamePart(lastName);

    if (!cleanFirstName) throw new Error("Enter your first name.");
    if (cleanFirstName.length > MAX_PROFILE_NAME_LENGTH || cleanLastName.length > MAX_PROFILE_NAME_LENGTH) {
        throw new Error(`Each name can be up to ${MAX_PROFILE_NAME_LENGTH} characters.`);
    }

    return { firstName: cleanFirstName, lastName: cleanLastName };
}

export function validateLoginHandle(value) {
    const username = typeof value === "string" ? value.trim() : "";
    const key = normalizeLoginHandle(username);

    if (!username) throw new Error("Enter a login handle.");
    if (username.length > MAX_LOGIN_HANDLE_LENGTH) {
        throw new Error(`Your login handle can be up to ${MAX_LOGIN_HANDLE_LENGTH} characters.`);
    }
    if (username.includes("/")) throw new Error("A login handle cannot contain a slash.");

    return { username, key };
}

// Name changes and their open-floor-plan stamps commit together. Each setup
// shift stores a memberNames override keyed by uid. That narrow map is what lets
// Firestore rules prove an employee changed only their own displayed name - an
// employee never gains write access to teams, roles, money, or settled history.
export async function updateOwnWorkName({ db, uid, firstName, lastName }) {
    const cleanName = validateWorkName(firstName, lastName);
    const openShiftDates = await discoverUnsettledShiftDates(db, uid);
    const batch = writeBatch(db);

    batch.update(doc(db, "users", uid), cleanName);
    openShiftDates.forEach((date) => {
        batch.update(
            doc(db, "shifts", date),
            new FieldPath("memberNames", uid),
            cleanName.firstName
        );
    });

    await batch.commit();
    return { ...cleanName, openShiftDates };
}

// The old mapping is deleted and the replacement is created in the same batch
// as users/{uid}.username. A collision rejects the whole batch, leaving the old
// handle intact. A casing-only edit keeps the same mapping document and updates
// it in place.
export async function updateOwnLoginHandle({ db, uid, email, oldUsername, newUsername, now = new Date() }) {
    const oldKey = normalizeLoginHandle(oldUsername);
    const { username, key: newKey } = validateLoginHandle(newUsername);

    if (!oldKey) throw new Error("Your current login handle is missing. Ask your manager for help.");
    if (!email) throw new Error("Your sign-in email is missing. Ask your manager for help.");

    const batch = writeBatch(db);
    const oldMappingRef = doc(db, "usernames", oldKey);
    const newMappingRef = doc(db, "usernames", newKey);
    const mapping = {
        uid,
        username,
        email,
        createdAt: now.toISOString(),
    };

    batch.update(doc(db, "users", uid), { username });
    if (oldKey === newKey) {
        batch.update(oldMappingRef, mapping);
    } else {
        batch.delete(oldMappingRef);
        batch.set(newMappingRef, mapping);
    }

    await batch.commit();
    return { username, oldKey, newKey };
}

export function applyOpenShiftMemberNames(shift) {
    if (!shift || shift.status !== "setup" || !shift.memberNames) return shift;
    const names = shift.memberNames;
    const renameMembers = (members = []) => members.map((member) => (
        names[member.uid] ? { ...member, name: names[member.uid] } : member
    ));

    return {
        ...shift,
        teams: (shift.teams || []).map((team) => ({ ...team, members: renameMembers(team.members) })),
        barTeam: { ...(shift.barTeam || {}), members: renameMembers(shift.barTeam?.members) },
        runners: renameMembers(shift.runners),
    };
}
