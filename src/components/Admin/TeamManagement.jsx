import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../config/firebase';
import { doc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { Badge, Button, Card, Select } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { canApproveAccounts } from '../../utils/permissions';
import {
    formatTempStaffMergeCollisionMessage,
    formatTempStaffMergeResultMessage,
    isTempStaffMergeCollisionError,
    mergeTempStaffIntoAccount,
} from '../../utils/tempStaffMergePersistence';
import { ASSIGNABLE_ROLES, roleLabel } from '../../utils/roleLabels';

function SectionCard({ title, count, description, children, tone = "neutral" }) {
    const toneClass =
        tone === "accent"
            ? "border-[var(--color-accent)]/15 bg-[var(--color-accent-soft)]/40"
            : tone === "muted"
                ? "opacity-90"
                : "";

    return (
        <Card className={"!p-0 " + toneClass}>
            <header className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[var(--color-line)]">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-display text-base font-medium tracking-tight text-[var(--color-ink)]">
                            {title}
                        </h3>
                        {count != null ? <Badge tone="accent">{count}</Badge> : null}
                    </div>
                    {description ? (
                        <p className="text-xs text-[var(--color-ink-soft)]">{description}</p>
                    ) : null}
                </div>
            </header>
            <div className="divide-y divide-[var(--color-line)]">{children}</div>
        </Card>
    );
}

function EmptyRow({ children }) {
    return (
        <div className="px-6 py-6 text-sm text-[var(--color-ink-muted)] text-center italic">
            {children}
        </div>
    );
}

const TeamManagement = ({ allEmployees, refreshEmployees }) => {
    const { user } = useAuth();
    // The gate on acting on a pending sign-up. The app bar's pending count reads
    // the same predicate, so the badge can never advertise work its viewer
    // cannot do. See src/utils/permissions.js.
    const canApprove = canApproveAccounts(user);
    const [loadingId, setLoadingId] = useState(null);
    const [unregisteredStaff, setUnregisteredStaff] = useState([]);
    const [linkTargetUpdates, setLinkTargetUpdates] = useState({});

    const fetchUnregistered = async () => {
        try {
            const snap = await getDocs(collection(db, "unregisteredStaff"));
            setUnregisteredStaff(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
        } catch (error) {
            console.error("Failed to fetch unregistered staff:", error);
        }
    };

    useEffect(() => {
        fetchUnregistered();
    }, []);

    const pendingUsers = useMemo(() => allEmployees.filter(emp => emp.status === "pending"), [allEmployees]);
    const activeUsers = useMemo(() => allEmployees.filter(emp => emp.status === "active" && emp.role !== "admin"), [allEmployees]);
    const inactiveUsers = useMemo(() => allEmployees.filter(emp => emp.status === "inactive" && emp.role !== "admin"), [allEmployees]);
    const mergeTargetUsers = useMemo(
        () => activeUsers,
        [activeUsers]
    );

    const handleUpdateUser = async (uid, updates) => {
        setLoadingId(uid);
        try {
            await updateDoc(doc(db, 'users', uid), updates);
            await refreshEmployees();
        } catch (error) {
            console.error("Failed to update user:", error);
            alert("Error updating user.");
        } finally {
            setLoadingId(null);
        }
    };

    // A role change writes immediately and shifts the person's default point
    // weight in future shifts, so confirm when *changing* an already-assigned
    // role. First-time assignment (unassigned -> a role) writes without a prompt.
    // On cancel we do nothing; the controlled <Select> reverts to the saved role.
    const handleRoleChange = (user, newRole) => {
        if (!newRole || newRole === user.role) return;
        const hadRole = user.role && user.role !== 'unassigned';
        if (hadRole) {
            // The prompt has a whole dialog to itself, so it names roles in full.
            const from = roleLabel(user.role);
            const to = roleLabel(newRole);
            const ok = window.confirm(
                `Change ${user.username || 'this employee'}'s role from ${from} to ${to}?\n\nThis also changes their default point weight in future shifts.`
            );
            if (!ok) return;
        }
        handleUpdateUser(user.uid, { role: newRole });
    };

    const handleDeactivateUser = async (uid, confirmMessage) => {
        if (!window.confirm(confirmMessage)) return;
        await handleUpdateUser(uid, { status: 'inactive' });
    };

    const handleLinkAccount = async (unregUser) => {
        const targetRealUid = linkTargetUpdates[unregUser.uid];
        if (!targetRealUid) return alert("Select the real employee account to merge this temporary profile into.");

        const realUser = allEmployees.find(e => e.uid === targetRealUid);
        if (!realUser) return;

        if (!window.confirm(`Merge temporary profile '${unregUser.name}' into ${realUser.username || realUser.name}?\n\nThis moves saved payout history to the real account and takes the temporary profile off every floor plan that still lists it, including nights that have not been settled up yet. The temporary profile will be removed after the merge.`)) return;

        setLoadingId(unregUser.uid);
        try {
            const result = await mergeTempStaffIntoAccount({
                db,
                tempUser: unregUser,
                realUser,
                updatedBy: user?.uid || null,
            });

            await fetchUnregistered();
            await refreshEmployees();
            setLinkTargetUpdates(prev => {
                const n = { ...prev };
                delete n[unregUser.uid];
                return n;
            });
            alert(formatTempStaffMergeResultMessage({ realUser, ...result }));
        } catch (error) {
            console.error("Failed to link account:", error);
            if (isTempStaffMergeCollisionError(error)) {
                alert(formatTempStaffMergeCollisionMessage(error.collisions));
            } else {
                alert("Error linking account.");
            }
        } finally {
            setLoadingId(null);
        }
    };

    const handleDeleteUnregistered = async (uid) => {
        if (!window.confirm("Delete this temporary staff profile? Past shifts keep the saved name/UID, but this profile will no longer appear when assigning future shifts.")) return;
        setLoadingId(uid);
        try {
            await deleteDoc(doc(db, "unregisteredStaff", uid));
            await fetchUnregistered();
        } catch (e) {
            console.error("Failed to delete unreg:", e);
        } finally {
            setLoadingId(null);
        }
    };

    const UserRow = ({ user, isPending }) => (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 max-[560px]:px-4 max-[560px]:py-3">
            <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-[var(--color-ink)] truncate">
                    {user.username}
                </span>
                <span className="text-xs text-[var(--color-ink-muted)] truncate">{user.email}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={user.role || ""}
                    onChange={(e) => handleRoleChange(user, e.target.value)}
                    disabled={loadingId === user.uid}
                    className="!h-9 !text-xs min-w-[8rem]"
                >
                    <option value="unassigned" disabled>Select role…</option>
                    {/* Full names: this is the canonical control for what someone
                        IS, and the select takes the whole row on a phone, so there
                        is room to be precise. */}
                    {ASSIGNABLE_ROLES.map(role => (
                        <option key={role} value={role}>{roleLabel(role)}</option>
                    ))}
                </Select>

                {isPending ? (
                    canApprove ? (
                        <>
                            <Button
                                size="sm"
                                onClick={() => handleUpdateUser(user.uid, { status: 'active' })}
                                disabled={loadingId === user.uid || user.role === 'unassigned'}
                                title={user.role === 'unassigned' ? "Assign a role first" : "Approve user"}
                            >
                                Approve
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDeactivateUser(
                                    user.uid,
                                    "Deny this sign-up request? The account will be marked inactive, and the user will not be able to access the dashboard. Their username stays reserved so it cannot be reused by another account."
                                )}
                                disabled={loadingId === user.uid}
                            >
                                Deny
                            </Button>
                        </>
                    ) : (
                        <span className="text-xs text-[var(--color-ink-muted)]">Awaiting approval</span>
                    )
                ) : (
                    <Button
                        size="sm"
                        variant={user.status === 'active' ? 'secondary' : 'primary'}
                        onClick={() => user.status === 'active'
                            ? handleDeactivateUser(
                                user.uid,
                                "Deactivate this employee? They will keep their account, username, and saved history, but they will not be able to access the dashboard until reactivated."
                            )
                            : handleUpdateUser(user.uid, { status: 'active' })}
                        disabled={loadingId === user.uid}
                    >
                        {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </Button>
                )}
            </div>
        </div>
    );

    const UnregisteredRow = ({ unregUser }) => (
        <div
            data-testid={`temp-staff-row-${unregUser.uid}`}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4"
        >
            <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-medium text-[var(--color-ink)] truncate">{unregUser.name}</span>
                {/* Badge defaults to all-caps, which is right for the count badges
                    it was built for but shouts a role name. This row has the width
                    for the full name, so it reads as a name, not a stored value. */}
                <Badge tone="neutral" className="self-start !normal-case">{roleLabel(unregUser.role)}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Select
                    aria-label={`Merge ${unregUser.name} into account`}
                    value={linkTargetUpdates[unregUser.uid] || ""}
                    onChange={(e) => setLinkTargetUpdates(prev => ({ ...prev, [unregUser.uid]: e.target.value }))}
                    disabled={mergeTargetUsers.length === 0}
                    className="!h-9 !text-xs min-w-[10rem]"
                >
                    <option value="" disabled>Merge into account…</option>
                    {mergeTargetUsers.map(emp => (
                        <option key={emp.uid} value={emp.uid}>{emp.username || emp.name} ({roleLabel(emp.role)})</option>
                    ))}
                </Select>
                {mergeTargetUsers.length === 0 ? (
                    <span className="text-xs text-[var(--color-ink-muted)]">No active accounts</span>
                ) : null}
                <Button
                    size="sm"
                    onClick={() => handleLinkAccount(unregUser)}
                    disabled={loadingId === unregUser.uid || !linkTargetUpdates[unregUser.uid]}
                    title="Merge this temporary profile into a real account"
                >
                    Merge
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteUnregistered(unregUser.uid)}
                    disabled={loadingId === unregUser.uid}
                    title="Delete temporary profile"
                    aria-label="Delete temporary profile"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="px-4 py-3 text-xs text-[var(--color-ink-soft)] bg-[var(--color-surface-muted)]/60 border border-[var(--color-line)] rounded-[var(--radius-sm)]">
                <strong className="text-[var(--color-ink)]">Account safety:</strong> denied or
                deactivated employees keep their username and saved history reserved. Reactivate
                the same profile if they return.
            </div>

            <SectionCard title="Pending Approvals" count={pendingUsers.length || null}>
                {pendingUsers.length === 0 ? (
                    <EmptyRow>No pending sign-ups.</EmptyRow>
                ) : (
                    pendingUsers.map(user => <UserRow key={user.uid} user={user} isPending />)
                )}
            </SectionCard>

            <SectionCard title="Active Team">
                {activeUsers.length === 0 ? (
                    <EmptyRow>No active employees.</EmptyRow>
                ) : (
                    activeUsers.map(user => <UserRow key={user.uid} user={user} isPending={false} />)
                )}
            </SectionCard>

            {unregisteredStaff.length > 0 ? (
                <SectionCard
                    title="Temporary Staff Profiles"
                    description="Staff added during shift setup before they had an account. Merge one into a real active account to transfer saved history."
                    tone="accent"
                >
                    <div className="px-6 py-3 text-xs text-[var(--color-ink-soft)] bg-[var(--color-surface-muted)]/60">
                        <strong className="text-[var(--color-ink)]">Merge early:</strong> merge a
                        temporary profile as soon as the employee's real account is approved. If the
                        same night ends up saved under both the temporary profile and their real
                        account, the merge is blocked for good and this history stays behind.
                    </div>
                    {unregisteredStaff.map(u => <UnregisteredRow key={u.uid} unregUser={u} />)}
                </SectionCard>
            ) : null}

            {inactiveUsers.length > 0 ? (
                <SectionCard
                    title="Inactive Employees"
                    description="These profiles cannot access the app, but their usernames and historical payout records remain attached to the same account."
                    tone="muted"
                >
                    {inactiveUsers.map(user => <UserRow key={user.uid} user={user} isPending={false} />)}
                </SectionCard>
            ) : null}
        </div>
    );
};

export default TeamManagement;
