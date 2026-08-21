const cleanNamePart = (value) => typeof value === "string" ? value.trim() : "";

export function firstNameFor(person, fallback = "Unnamed person") {
    return cleanNamePart(person?.firstName) || fallback;
}

export function fullNameFor(person, fallback = "Unnamed person") {
    const firstName = cleanNamePart(person?.firstName);
    const lastName = cleanNamePart(person?.lastName);
    return [firstName, lastName].filter(Boolean).join(" ") || fallback;
}

export function tempStaffNameFor(person, fallback = "Unnamed person") {
    return cleanNamePart(person?.name) || cleanNamePart(person?.username) || fallback;
}

export function tempStaffRosterNameFor(person, fallback = "Unnamed person") {
    return cleanNamePart(person?.username) || cleanNamePart(person?.name) || fallback;
}
