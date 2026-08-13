import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatMonthDayRange, getCurrentWeek, toDateKey } from "../../utils/dateUtils";
import {
    canApproveAccounts,
    canAssignRoles,
    canDeactivateAccounts,
    canMergeTempStaff,
    canReadColleaguePay,
    canSetSupervisor,
    isPaidFromPool,
} from "../../utils/permissions";
import { ASSIGNABLE_ROLES, roleLabel, roleShortLabel } from "../../utils/roleLabels";
import { firstNameFor, fullNameFor, tempStaffRosterNameFor } from "../../utils/userNames";
import {
    formatTempStaffMergeCollisionMessage,
    formatTempStaffMergeResultMessage,
    isTempStaffMergeCollisionError,
    mergeTempStaffIntoAccount,
} from "../../utils/tempStaffMergePersistence";
import PayStatement from "../Pay/PayStatement";
import IdentityCard from "../Account/IdentityCard";
import { Badge, Button, Card, Select } from "../ui";
import BarDatePill from "./BarDatePill";

const STATUS_FILTERS = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "temp", label: "Temp" },
];

const STATUS_ORDER = { pending: 0, temp: 1, active: 2, inactive: 3 };

function personName(person) {
    return person?.isTemp
        ? tempStaffRosterNameFor(person)
        : fullNameFor(person);
}

function rosterName(person) {
    return person?.isTemp
        ? tempStaffRosterNameFor(person)
        : firstNameFor(person);
}

function personStatus(person) {
    return person?.isTemp ? "temp" : person?.status || "inactive";
}

function statusLabel(status) {
    return status === "temp" ? "Temp" : status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status) {
    if (status === "active") return "success";
    if (status === "pending" || status === "temp") return "warning";
    return "neutral";
}

function BackIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.65" y2="16.65" />
        </svg>
    );
}

function RosterRow({ person, onOpen }) {
    const status = personStatus(person);

    return (
        <button
            type="button"
            onClick={onOpen}
            data-testid={`roster-row-${person.uid}`}
            className="group flex min-h-16 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-[var(--color-surface-muted)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/30 sm:px-5"
            aria-label={`Open ${rosterName(person)}, ${roleLabel(person.role)}, ${statusLabel(status)}`}
        >
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
                    {rosterName(person)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--color-ink-muted)]">
                    {roleShortLabel(person.role)}
                    {person.isSupervisor === true ? " · Supervisor" : ""}
                </span>
            </span>
            <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
            <span className="text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink-soft)]">
                <ChevronIcon />
            </span>
        </button>
    );
}

function RosterList({ people, search, setSearch, statusFilter, setStatusFilter, onOpen }) {
    const counts = useMemo(() => people.reduce((result, person) => {
        const status = personStatus(person);
        result[status] = (result[status] || 0) + 1;
        return result;
    }, {}), [people]);

    const filteredPeople = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return people.filter((person) => {
            const status = personStatus(person);
            if (statusFilter !== "all" && status !== statusFilter) return false;
            if (!query) return true;
            return [
                personName(person),
                person.email,
                roleLabel(person.role),
                roleShortLabel(person.role),
                statusLabel(status),
            ].filter(Boolean).some((value) => value.toLocaleLowerCase().includes(query));
        });
    }, [people, search, statusFilter]);

    return (
        <div className="space-y-4" data-testid="team-roster">
            <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-ink-muted)]">
                    <SearchIcon />
                </span>
                <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="Search team"
                    placeholder="Search by name, email, or role"
                    className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] pl-10 pr-3 text-sm text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink-muted)] hover:border-[var(--color-line-strong)] focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/15"
                />
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter team by status">
                {STATUS_FILTERS.map((filter) => {
                    const selected = statusFilter === filter.value;
                    const count = filter.value === "all" ? people.length : counts[filter.value] || 0;
                    return (
                        <button
                            type="button"
                            key={filter.value}
                            onClick={() => setStatusFilter(filter.value)}
                            aria-pressed={selected}
                            className={
                                "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                                (selected
                                    ? "border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                                    : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]")
                            }
                        >
                            {filter.label}
                            <span className={selected ? "text-[var(--color-accent)]/75" : "text-[var(--color-ink-muted)]"}>{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-ink-muted)]">
                <span>{filteredPeople.length} {filteredPeople.length === 1 ? "person" : "people"}</span>
                {search || statusFilter !== "all" ? (
                    <button
                        type="button"
                        className="min-h-10 px-2 font-medium text-[var(--color-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                        onClick={() => {
                            setSearch("");
                            setStatusFilter("all");
                        }}
                    >
                        Clear filters
                    </button>
                ) : null}
            </div>

            <Card className="!p-0 overflow-hidden">
                {filteredPeople.length > 0 ? (
                    <div className="divide-y divide-[var(--color-line)]">
                        {filteredPeople.map((person) => (
                            <RosterRow key={`${person.isTemp ? "temp" : "user"}-${person.uid}`} person={person} onOpen={() => onOpen(person)} />
                        ))}
                    </div>
                ) : (
                    <div className="px-6 py-12 text-center">
                        <p className="text-sm font-medium text-[var(--color-ink)]">No people found</p>
                        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">Try another name or status.</p>
                    </div>
                )}
            </Card>
        </div>
    );
}

function ManagementActions({
    person,
    allEmployees,
    loadingId,
    updateUser,
    deleteTemp,
    mergeTemp,
    canApprove,
    canAssign,
    canDeactivate,
    canMerge,
    canManageSupervisor,
    viewerUid,
}) {
    const [roleDraft, setRoleDraft] = useState(person.role || "unassigned");
    const [mergeTarget, setMergeTarget] = useState("");
    const name = personName(person);

    useEffect(() => {
        setRoleDraft(person.role || "unassigned");
        setMergeTarget("");
    }, [person.uid, person.role]);

    const busy = loadingId === person.uid;
    const mergeTargets = allEmployees.filter((employee) =>
        !employee.isTemp && employee.status === "active" && employee.role !== "admin" && employee.uid !== viewerUid
    );

    const confirmRoleChange = () => {
        if (!roleDraft || roleDraft === "unassigned" || roleDraft === person.role) return;
        const hadRole = person.role && person.role !== "unassigned";
        const action = hadRole
            ? `Change ${name}'s job title from ${roleLabel(person.role)} to ${roleLabel(roleDraft)}?`
            : `Assign ${name} the job title ${roleLabel(roleDraft)}?`;
        const confirmed = window.confirm(
            `${action}\n\nThis changes their default point weight for future shifts. Saved floor plans and past pay do not change.`
        );
        if (confirmed) updateUser(person.uid, { role: roleDraft });
    };

    const confirmSupervisorChange = () => {
        const enabling = person.isSupervisor !== true;
        const confirmed = window.confirm(
            `${enabling ? "Turn on" : "Turn off"} Supervisor for ${name}?\n\n` +
            (enabling
                ? "They will be able to open the full roster, read colleagues' pay, build floor plans, enter money, and correct settled days. Their job title and pay do not change."
                : "They will lose roster and shift-management access. Their job title and pay do not change.")
        );
        if (confirmed) updateUser(person.uid, { isSupervisor: enabling });
    };

    const confirmDeactivate = () => {
        const confirmed = window.confirm(
            `Deactivate ${name}?\n\nThey keep their account, username, and saved pay history, but cannot access the app until reactivated. Saved floor plans are not changed.`
        );
        if (confirmed) updateUser(person.uid, { status: "inactive" });
    };

    const confirmReactivate = () => {
        if (window.confirm(`Reactivate ${name}?\n\nThey will be able to sign in again.`)) {
            updateUser(person.uid, { status: "active" });
        }
    };

    const confirmDeny = () => {
        const confirmed = window.confirm(
            `Deny ${name}'s sign-up request?\n\nThe account will be inactive and unable to access the app. Their login handle remains tied to this account.`
        );
        if (confirmed) updateUser(person.uid, { status: "inactive" });
    };

    if (person.isTemp) {
        if (!canMerge) return null;
        return (
            <Card className="!p-0 overflow-hidden" data-testid="management-actions">
                <div className="border-b border-[var(--color-line)] px-5 py-4 sm:px-6">
                    <h3 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">Temporary profile</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                        Merge as soon as the real account is approved. The rule is per date and all-or-nothing: if both profiles have saved payout history on even one same date, the entire merge stops and nothing moves.
                    </p>
                </div>
                <div className="space-y-3 px-5 py-4 sm:px-6">
                    <Select
                        label="Real employee account"
                        value={mergeTarget}
                        onChange={(event) => setMergeTarget(event.target.value)}
                        disabled={busy || mergeTargets.length === 0}
                        aria-label={`Merge ${name} into account`}
                    >
                        <option value="" disabled>Choose an active account…</option>
                        {mergeTargets.map((employee) => (
                            <option key={employee.uid} value={employee.uid}>
                                {personName(employee)} ({roleLabel(employee.role)})
                            </option>
                        ))}
                    </Select>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            className="min-h-11"
                            onClick={() => mergeTemp(person, mergeTarget)}
                            disabled={busy || !mergeTarget}
                        >
                            Merge profile
                        </Button>
                        <Button
                            className="min-h-11"
                            variant="danger"
                            onClick={() => deleteTemp(person)}
                            disabled={busy}
                        >
                            Delete temporary profile
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    const hasAnyAction = canAssign || canDeactivate || canApprove || canManageSupervisor;
    if (!hasAnyAction) return null;

    return (
        <Card className="!p-0 overflow-hidden" data-testid="management-actions">
            <div className="border-b border-[var(--color-line)] px-5 py-4 sm:px-6">
                <h3 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">Manage person</h3>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">Changes here affect access or future pay weight.</p>
            </div>

            {canAssign ? (
                <div className="space-y-3 border-b border-[var(--color-line)] px-5 py-4 sm:px-6">
                    <Select
                        id={`job-title-${person.uid}`}
                        label="Job title"
                        value={roleDraft}
                        onChange={(event) => setRoleDraft(event.target.value)}
                        disabled={busy}
                    >
                        <option value="unassigned" disabled>Select a job title…</option>
                        {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>{roleLabel(role)}</option>
                        ))}
                    </Select>
                    <Button
                        variant="secondary"
                        className="min-h-11"
                        onClick={confirmRoleChange}
                        disabled={busy || roleDraft === person.role || roleDraft === "unassigned"}
                    >
                        Save job title
                    </Button>
                </div>
            ) : null}

            {canManageSupervisor && person.status === "active" && person.uid !== viewerUid ? (
                <div className="flex flex-col gap-3 border-b border-[var(--color-line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                        <p className="text-sm font-medium text-[var(--color-ink)]">Supervisor</p>
                        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">Shift and roster access. Separate from job title and pay.</p>
                    </div>
                    <Button
                        variant={person.isSupervisor === true ? "secondary" : "primary"}
                        className="min-h-11 self-start sm:self-auto"
                        onClick={confirmSupervisorChange}
                        disabled={busy}
                    >
                        Turn {person.isSupervisor === true ? "off" : "on"}
                    </Button>
                </div>
            ) : null}

            <div className="flex flex-wrap gap-2 px-5 py-4 sm:px-6">
                {person.status === "pending" && canApprove ? (
                    <>
                        <Button
                            className="min-h-11"
                            onClick={() => updateUser(person.uid, { status: "active" })}
                            disabled={busy || person.role === "unassigned"}
                            title={person.role === "unassigned" ? "Save a job title first" : "Approve account"}
                        >
                            Approve account
                        </Button>
                        <Button className="min-h-11" variant="danger" onClick={confirmDeny} disabled={busy}>
                            Deny request
                        </Button>
                    </>
                ) : person.status === "active" && canDeactivate ? (
                    <Button className="min-h-11" variant="danger" onClick={confirmDeactivate} disabled={busy}>
                        Deactivate account
                    </Button>
                ) : person.status === "inactive" && canDeactivate ? (
                    <Button className="min-h-11" onClick={confirmReactivate} disabled={busy}>
                        Reactivate account
                    </Button>
                ) : null}
            </div>
        </Card>
    );
}

function PersonView({
    person,
    allEmployees,
    onBack,
    loadingId,
    updateUser,
    deleteTemp,
    mergeTemp,
    capabilities,
    viewerUid,
    userManagerUid,
}) {
    const [anchorDate, setAnchorDate] = useState(() => toDateKey(new Date()));
    const weekDates = useMemo(() => getCurrentWeek(new Date(`${anchorDate}T12:00:00`)), [anchorDate]);
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];
    return (
        <div className="space-y-4" data-testid="person-view">
            <Button variant="ghost" className="min-h-11 !px-2" onClick={onBack} aria-label="Back to team roster">
                <BackIcon />
                Team roster
            </Button>

            <IdentityCard person={person} mode="manage" managerUid={userManagerUid} />

            <ManagementActions
                person={person}
                allEmployees={allEmployees}
                loadingId={loadingId}
                updateUser={updateUser}
                deleteTemp={deleteTemp}
                mergeTemp={mergeTemp}
                canApprove={capabilities.canApprove}
                canAssign={capabilities.canAssign}
                canDeactivate={capabilities.canDeactivate}
                canMerge={capabilities.canMerge}
                canManageSupervisor={capabilities.canManageSupervisor}
                viewerUid={viewerUid}
            />

            {capabilities.canReadPay ? (
                <section className="space-y-3" aria-labelledby="person-pay-heading">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">Pay history</span>
                            <h3 id="person-pay-heading" className="mt-1 font-display text-xl font-medium tracking-tight text-[var(--color-ink)]">{personName(person)}'s pay</h3>
                        </div>
                        <BarDatePill selectedDate={anchorDate} onSelectDate={setAnchorDate} unit="week" />
                    </div>
                    <PayStatement
                        person={person}
                        startDate={weekStart}
                        endDate={weekEnd}
                        eyebrow="Selected week"
                        heading={`${formatMonthDayRange(weekStart, weekEnd)}, ${weekEnd.getFullYear()}`}
                        voice="colleague"
                    />
                </section>
            ) : null}
        </div>
    );
}

function TeamManagement({ allEmployees, refreshEmployees }) {
    const { user } = useAuth();
    const [loadingId, setLoadingId] = useState(null);
    const [unregisteredStaff, setUnregisteredStaff] = useState([]);
    const [selectedKey, setSelectedKey] = useState(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    const capabilities = useMemo(() => ({
        canApprove: canApproveAccounts(user),
        canAssign: canAssignRoles(user),
        canDeactivate: canDeactivateAccounts(user),
        canMerge: canMergeTempStaff(user),
        canManageSupervisor: canSetSupervisor(user),
        canReadPay: canReadColleaguePay(user),
    }), [user]);

    const fetchUnregistered = async () => {
        try {
            const snapshot = await getDocs(collection(db, "unregisteredStaff"));
            setUnregisteredStaff(snapshot.docs.map((item) => ({ uid: item.id, ...item.data(), isTemp: true })));
        } catch (error) {
            console.error("Failed to fetch unregistered staff:", error);
        }
    };

    useEffect(() => {
        fetchUnregistered();
    }, []);

    const rosterPeople = useMemo(() => {
        const realPeople = allEmployees
            .filter((person) => isPaidFromPool(person, user?.managerUid))
            .map((person) => ({ ...person, isTemp: false }));
        return [...realPeople, ...unregisteredStaff].sort((left, right) => {
            const statusDifference = STATUS_ORDER[personStatus(left)] - STATUS_ORDER[personStatus(right)];
            return statusDifference || rosterName(left).localeCompare(rosterName(right));
        });
    }, [allEmployees, unregisteredStaff, user?.managerUid]);

    const selectedPerson = useMemo(() => {
        if (!selectedKey) return null;
        return rosterPeople.find((person) => `${person.isTemp ? "temp" : "user"}:${person.uid}` === selectedKey) || null;
    }, [rosterPeople, selectedKey]);

    useEffect(() => {
        if (selectedKey && !selectedPerson) setSelectedKey(null);
    }, [selectedKey, selectedPerson]);

    const updateUser = async (uid, updates) => {
        setLoadingId(uid);
        try {
            await updateDoc(doc(db, "users", uid), updates);
            await refreshEmployees();
        } catch (error) {
            console.error("Failed to update user:", error);
            alert("The account could not be updated. Please try again.");
        } finally {
            setLoadingId(null);
        }
    };

    const mergeTemp = async (tempPerson, targetUid) => {
        if (!targetUid) return;
        const realUser = allEmployees.find((employee) => employee.uid === targetUid);
        if (!realUser) return;
        const confirmed = window.confirm(
            `Merge temporary profile '${personName(tempPerson)}' into ${personName(realUser)}?\n\n` +
            "This merge is per date and all-or-nothing. A same-date payout on both profiles stops the entire merge and changes nothing. If it succeeds, saved payout history moves to the real account, every floor plan still listing the temporary profile is updated, and the temporary profile is removed."
        );
        if (!confirmed) return;

        setLoadingId(tempPerson.uid);
        try {
            const result = await mergeTempStaffIntoAccount({
                db,
                tempUser: tempPerson,
                realUser,
                updatedBy: user?.uid || null,
            });
            await fetchUnregistered();
            await refreshEmployees();
            setSelectedKey(null);
            alert(formatTempStaffMergeResultMessage({ realUser, ...result }));
        } catch (error) {
            console.error("Failed to link account:", error);
            if (isTempStaffMergeCollisionError(error)) {
                alert(formatTempStaffMergeCollisionMessage(error.collisions));
            } else {
                alert("The temporary profile could not be merged. Please try again.");
            }
        } finally {
            setLoadingId(null);
        }
    };

    const deleteTemp = async (tempPerson) => {
        const confirmed = window.confirm(
            `Delete temporary profile ${personName(tempPerson)}?\n\nPast shifts keep the saved name and UID, but the profile will no longer appear for future floor plans. This does not merge any pay history.`
        );
        if (!confirmed) return;
        setLoadingId(tempPerson.uid);
        try {
            await deleteDoc(doc(db, "unregisteredStaff", tempPerson.uid));
            await fetchUnregistered();
            setSelectedKey(null);
        } catch (error) {
            console.error("Failed to delete temporary profile:", error);
            alert("The temporary profile could not be deleted. Please try again.");
        } finally {
            setLoadingId(null);
        }
    };

    if (selectedPerson) {
        return (
            <PersonView
                person={selectedPerson}
                allEmployees={rosterPeople.filter((person) => !person.isTemp)}
                onBack={() => setSelectedKey(null)}
                loadingId={loadingId}
                updateUser={updateUser}
                deleteTemp={deleteTemp}
                mergeTemp={mergeTemp}
                capabilities={capabilities}
                viewerUid={user?.uid}
                userManagerUid={user?.managerUid}
            />
        );
    }

    return (
        <RosterList
            people={rosterPeople}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onOpen={(person) => setSelectedKey(`${person.isTemp ? "temp" : "user"}:${person.uid}`)}
        />
    );
}

export default TeamManagement;
