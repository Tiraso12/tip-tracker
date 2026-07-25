import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../config/firebase';
import { doc, updateDoc, deleteDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { Badge, Button, Card, Select } from '../ui';
import { getMergeHistoryState } from '../../utils/userHistoryFlags';

const ROLES = ["captain", "server", "back", "assistant", "bartender", "runner"];
const ROLE_LABELS = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

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
    const [loadingId, setLoadingId] = useState(null);
    const [unregisteredStaff, setUnregisteredStaff] = useState([]);
    const [linkTargetUpdates, setLinkTargetUpdates] = useState({});
    const [accountsWithData, setAccountsWithData] = useState({});
    const [mergeEligibilityLoading, setMergeEligibilityLoading] = useState(true);

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
        () => activeUsers.filter(emp => !accountsWithData[emp.uid]),
        [activeUsers, accountsWithData]
    );

    useEffect(() => {
        let cancelled = false;
        const loadMergeEligibility = async () => {
            if (activeUsers.length === 0) {
                setAccountsWithData({});
                setMergeEligibilityLoading(false);
                return;
            }

            setMergeEligibilityLoading(true);
            try {
                const nextAccountsWithData = {};
                const legacyUsers = [];
                activeUsers.forEach(emp => {
                    const historyState = getMergeHistoryState(emp);
                    nextAccountsWithData[emp.uid] = historyState.hasHistory;
                    if (historyState.needsFallbackScan) {
                        legacyUsers.push(emp);
                    }
                });

                if (legacyUsers.length > 0) {
                    const shiftSnap = await getDocs(collection(db, "shifts"));
                    shiftSnap.docs.forEach(shiftDoc => {
                        const shiftData = shiftDoc.data();
                        legacyUsers.forEach(emp => {
                            if (nextAccountsWithData[emp.uid]) return;
                            const inPayouts = !!shiftData.payouts?.[emp.uid];
                            const inTeams = (shiftData.teams || []).some(team =>
                                (team.members || []).some(member => member.uid === emp.uid)
                            );
                            const inBar = (shiftData.barTeam?.members || []).some(member => member.uid === emp.uid);
                            const inRunners = (shiftData.runners || []).some(member => member.uid === emp.uid);
                            if (inPayouts || inTeams || inBar || inRunners) {
                                nextAccountsWithData[emp.uid] = true;
                            }
                        });
                    });
                }

                await Promise.all(legacyUsers.map(async emp => {
                    if (nextAccountsWithData[emp.uid]) return;
                    const tipsSnap = await getDocs(collection(db, "users", emp.uid, "tips"));
                    if (!tipsSnap.empty) {
                        nextAccountsWithData[emp.uid] = true;
                    }
                }));

                if (!cancelled) {
                    setAccountsWithData(nextAccountsWithData);
                }
            } catch (error) {
                console.error("Failed to check merge eligibility:", error);
            } finally {
                if (!cancelled) {
                    setMergeEligibilityLoading(false);
                }
            }
        };

        loadMergeEligibility();
        return () => { cancelled = true; };
    }, [activeUsers]);

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

    const handleDeactivateUser = async (uid, confirmMessage) => {
        if (!window.confirm(confirmMessage)) return;
        await handleUpdateUser(uid, { status: 'inactive' });
    };

    const handleLinkAccount = async (unregUser) => {
        const targetRealUid = linkTargetUpdates[unregUser.uid];
        if (!targetRealUid) return alert("Select the real employee account to merge this temporary profile into.");

        const realUser = allEmployees.find(e => e.uid === targetRealUid);
        if (!realUser) return;

        if (mergeEligibilityLoading) {
            alert("Wait until account data checks finish before merging.");
            return;
        }

        if (accountsWithData[targetRealUid]) {
            alert("This account already has saved shift or tip history, so it cannot be used as a merge target. Choose an empty active account instead.");
            return;
        }

        if (!window.confirm(`Merge temporary profile '${unregUser.name}' into ${realUser.username || realUser.name}?\n\nThis updates past shifts and moves saved tip history to the real account. The temporary profile will be removed after the merge.`)) return;

        setLoadingId(unregUser.uid);
        try {
            const shiftsSnap = await getDocs(collection(db, "shifts"));
            for (const shiftDoc of shiftsSnap.docs) {
                const shiftData = shiftDoc.data();
                let modified = false;

                if (shiftData.teams) {
                    shiftData.teams.forEach(t => {
                        const idx = t.members?.findIndex(m => m.uid === unregUser.uid);
                        if (idx !== undefined && idx !== -1) {
                            t.members[idx].uid = realUser.uid;
                            t.members[idx].name = realUser.username || realUser.name;
                            modified = true;
                        }
                    });
                }
                if (shiftData.barTeam?.members) {
                    const idx = shiftData.barTeam.members.findIndex(m => m.uid === unregUser.uid);
                    if (idx !== -1) {
                        shiftData.barTeam.members[idx].uid = realUser.uid;
                        shiftData.barTeam.members[idx].name = realUser.username || realUser.name;
                        modified = true;
                    }
                }
                if (shiftData.runners) {
                    const idx = shiftData.runners.findIndex(m => m.uid === unregUser.uid);
                    if (idx !== -1) {
                        shiftData.runners[idx].uid = realUser.uid;
                        shiftData.runners[idx].name = realUser.username || realUser.name;
                        modified = true;
                    }
                }
                if (shiftData.payouts && shiftData.payouts[unregUser.uid]) {
                    const payoutData = shiftData.payouts[unregUser.uid];
                    payoutData.name = realUser.username || realUser.name;
                    shiftData.payouts[realUser.uid] = payoutData;
                    delete shiftData.payouts[unregUser.uid];
                    modified = true;
                }

                if (modified) {
                    await updateDoc(doc(db, "shifts", shiftDoc.id), {
                        teams: shiftData.teams || [],
                        barTeam: shiftData.barTeam || {},
                        runners: shiftData.runners || [],
                        payouts: shiftData.payouts || {}
                    });
                }
            }

            const tipsSnap = await getDocs(collection(db, `users/${unregUser.uid}/tips`));
            for (const tipDoc of tipsSnap.docs) {
                await setDoc(doc(db, `users/${realUser.uid}/tips`, tipDoc.id), tipDoc.data());
                await deleteDoc(doc(db, `users/${unregUser.uid}/tips`, tipDoc.id));
            }

            await updateDoc(doc(db, "users", realUser.uid), {
                hasShiftHistory: true,
                hasTipHistory: true,
            });

            await deleteDoc(doc(db, "unregisteredStaff", unregUser.uid));

            await fetchUnregistered();
            await refreshEmployees();
            setLinkTargetUpdates(prev => {
                const n = { ...prev };
                delete n[unregUser.uid];
                return n;
            });
            alert("Temporary profile merged into the real account.");
        } catch (error) {
            console.error("Failed to link account:", error);
            alert("Error linking account.");
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4">
            <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-[var(--color-ink)] truncate">
                    {user.username}
                </span>
                <span className="text-xs text-[var(--color-ink-muted)] truncate">{user.email}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={user.role || ""}
                    onChange={(e) => handleUpdateUser(user.uid, { role: e.target.value })}
                    disabled={loadingId === user.uid}
                    className="!h-9 !text-xs min-w-[8rem]"
                >
                    <option value="unassigned" disabled>Select role…</option>
                    {ROLES.map(role => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                    ))}
                </Select>

                {isPending ? (
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4">
            <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-medium text-[var(--color-ink)] truncate">{unregUser.name}</span>
                <Badge tone="neutral" className="self-start">{unregUser.role}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={linkTargetUpdates[unregUser.uid] || ""}
                    onChange={(e) => setLinkTargetUpdates(prev => ({ ...prev, [unregUser.uid]: e.target.value }))}
                    disabled={mergeEligibilityLoading || mergeTargetUsers.length === 0}
                    className="!h-9 !text-xs min-w-[10rem]"
                >
                    <option value="" disabled>Merge into account…</option>
                    {mergeTargetUsers.map(emp => (
                        <option key={emp.uid} value={emp.uid}>{emp.username || emp.name} ({emp.role})</option>
                    ))}
                </Select>
                {mergeEligibilityLoading ? (
                    <span className="text-xs text-[var(--color-ink-muted)]">Checking data…</span>
                ) : mergeTargetUsers.length === 0 ? (
                    <span className="text-xs text-[var(--color-ink-muted)]">No empty active accounts</span>
                ) : null}
                <Button
                    size="sm"
                    onClick={() => handleLinkAccount(unregUser)}
                    disabled={loadingId === unregUser.uid || mergeEligibilityLoading || !linkTargetUpdates[unregUser.uid]}
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
