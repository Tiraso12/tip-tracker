import React from "react";
import { tierLabel } from "../../utils/permissions";
import { roleLabel } from "../../utils/roleLabels";
import { fullNameFor, tempStaffNameFor } from "../../utils/userNames";
import { Badge, Card } from "../ui";

function statusLabel(status) {
    const value = status || "inactive";
    return value === "temp" ? "Temp" : value.charAt(0).toUpperCase() + value.slice(1);
}

function statusTone(status) {
    if (status === "active") return "success";
    if (status === "pending" || status === "temp") return "warning";
    return "neutral";
}

function memberSinceLabel(value) {
    if (!value) return "Not recorded";
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function Detail({ label, value, note, truncate = false }) {
    return (
        <div className="min-w-0 px-5 py-4 sm:px-6">
            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">{label}</dt>
            <dd className={"mt-1 text-sm font-medium text-[var(--color-ink)] " + (truncate ? "truncate" : "break-words")}>{value}</dd>
            {note ? <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">{note}</p> : null}
        </div>
    );
}

// One identity component, two modes. Team's person view uses manage mode and a
// person uses own mode. The facts and wording therefore cannot drift between a
// manager looking at someone and that person looking at themself.
function IdentityCard({ person, mode = "manage", managerUid = person?.managerUid }) {
    const isTemp = person?.isTemp === true;
    const status = isTemp ? "temp" : person?.status || "inactive";
    const name = isTemp ? tempStaffNameFor(person) : fullNameFor(person);
    const tier = isTemp ? null : tierLabel({ ...person, managerUid });
    const jobTitle = person?.role === "unassigned" ? "Not assigned" : roleLabel(person?.role);
    const handle = person?.username || "Not recorded";
    // The switch is only ever offered to a captain-titled person - see
    // canOfferSupervisor in permissions.js. Showing "Off" on everyone else's
    // identity states a fact that can never change for them, so the row is
    // shown by job title alone, independent of active status.
    const showSupervisor = !isTemp && person?.role === "captain";

    return (
        <Card className="!p-0 overflow-hidden" data-testid="person-identity" data-mode={mode}>
            <div className="px-5 py-5 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                            {mode === "own" ? "Your identity" : isTemp ? "Temporary profile" : "Team member"}
                        </span>
                        <h2 className="mt-1 truncate font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">{name}</h2>
                        {person?.email ? <p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]">{person.email}</p> : null}
                    </div>
                    <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
                </div>
            </div>

            <dl className="grid grid-cols-2 border-t border-[var(--color-line)]">
                <Detail label="Login handle" value={handle} />
                <Detail
                    label="Email"
                    value={person?.email || "Not recorded"}
                    note={mode === "own" ? "Ask your manager to change this email." : undefined}
                    truncate
                />
                <Detail label="Job title" value={jobTitle} />
                <Detail label="Tier" value={tier || "Employee"} />
                {showSupervisor ? (
                    <Detail label="Supervisor" value={person?.isSupervisor === true ? "On" : "Off"} />
                ) : null}
                <Detail label="Account status" value={statusLabel(status)} />
                {mode === "own" ? <Detail label="Member since" value={memberSinceLabel(person?.createdAt)} /> : null}
            </dl>
        </Card>
    );
}

export default IdentityCard;
