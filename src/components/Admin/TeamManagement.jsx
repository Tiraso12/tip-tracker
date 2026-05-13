import React, { useState, useEffect, useMemo } from 'react';
import styles from './TeamManagement.module.css';
import { db } from '../../config/firebase';
import { doc, updateDoc, deleteDoc, collection, getDocs, setDoc } from 'firebase/firestore';

const ROLES = ["captain", "server", "back", "assistant", "bartender", "runner"];
const ROLE_LABELS = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner"
};

const TeamManagement = ({ allEmployees, refreshEmployees }) => {
    const [loadingId, setLoadingId] = useState(null);
    const [unregisteredStaff, setUnregisteredStaff] = useState([]);
    const [linkTargetUpdates, setLinkTargetUpdates] = useState({}); // unregUid -> selected real uid
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

    // Split users into lists
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

                activeUsers.forEach(emp => {
                    nextAccountsWithData[emp.uid] = false;
                });

                const shiftSnap = await getDocs(collection(db, "shifts"));
                shiftSnap.docs.forEach(shiftDoc => {
                    const shiftData = shiftDoc.data();

                    activeUsers.forEach(emp => {
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

                await Promise.all(activeUsers.map(async emp => {
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

        return () => {
            cancelled = true;
        };
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
            // 1. Find all shifts that reference the unreg user and replace their UID and Name
            const shiftsSnap = await getDocs(collection(db, "shifts"));
            for (const shiftDoc of shiftsSnap.docs) {
                const shiftData = shiftDoc.data();
                let modified = false;

                // Update restaurant teams
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

                // Update bar team
                if (shiftData.barTeam?.members) {
                    const idx = shiftData.barTeam.members.findIndex(m => m.uid === unregUser.uid);
                    if (idx !== -1) {
                        shiftData.barTeam.members[idx].uid = realUser.uid;
                        shiftData.barTeam.members[idx].name = realUser.username || realUser.name;
                        modified = true;
                    }
                }

                // Update runners
                if (shiftData.runners) {
                    const idx = shiftData.runners.findIndex(m => m.uid === unregUser.uid);
                    if (idx !== -1) {
                        shiftData.runners[idx].uid = realUser.uid;
                        shiftData.runners[idx].name = realUser.username || realUser.name;
                        modified = true;
                    }
                }

                // Update payouts object key
                if (shiftData.payouts && shiftData.payouts[unregUser.uid]) {
                    const payoutData = shiftData.payouts[unregUser.uid];
                    payoutData.name = realUser.username || realUser.name; // update name on payout
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

            // 2. Transfer all existing tip docs from the unreg user's subcollection to the real user
            const tipsSnap = await getDocs(collection(db, `users/${unregUser.uid}/tips`));
            for (const tipDoc of tipsSnap.docs) {
                await setDoc(doc(db, `users/${realUser.uid}/tips`, tipDoc.id), tipDoc.data());
                await deleteDoc(doc(db, `users/${unregUser.uid}/tips`, tipDoc.id));
            }

            // 3. Delete the temporary unregistered placeholder
            await deleteDoc(doc(db, "unregisteredStaff", unregUser.uid));

            // Refresh
            await fetchUnregistered();
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
        <div className={styles.userRow}>
            <div className={styles.userInfo}>
                <span className={styles.userName}>{user.username}</span>
                <span className={styles.userEmail}>{user.email}</span>
            </div>

            <div className={styles.userActions}>
                <select
                    className={styles.roleSelect}
                    value={user.role || ""}
                    onChange={(e) => handleUpdateUser(user.uid, { role: e.target.value })}
                    disabled={loadingId === user.uid}
                >
                    <option value="unassigned" disabled>Select Role...</option>
                    {ROLES.map(role => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                    ))}
                </select>

                {isPending ? (
                    <>
                        <button
                            className={`${styles.actionBtn} ${styles.approveBtn}`}
                            onClick={() => handleUpdateUser(user.uid, { status: 'active' })}
                            disabled={loadingId === user.uid || user.role === 'unassigned'}
                            title={user.role === 'unassigned' ? "Assign a role first" : "Approve User"}
                        >
                            Approve
                        </button>
                        <button
                            className={`${styles.actionBtn} ${styles.denyBtn}`}
                            onClick={() => handleDeactivateUser(
                                user.uid,
                                "Deny this sign-up request? The account will be marked inactive, and the user will not be able to access the dashboard."
                            )}
                            disabled={loadingId === user.uid}
                        >
                            Deny
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            className={`${styles.actionBtn} ${user.status === 'active' ? styles.denyBtn : styles.approveBtn}`}
                            onClick={() => user.status === 'active'
                                ? handleDeactivateUser(
                                    user.uid,
                                    "Deactivate this employee? They will keep their account and saved history, but they will not be able to access the dashboard until reactivated."
                                )
                                : handleUpdateUser(user.uid, { status: 'active' })}
                            disabled={loadingId === user.uid}
                        >
                            {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );

    const UnregisteredRow = ({ unregUser }) => (
        <div className={styles.userRow}>
            <div className={styles.userInfo}>
                <span className={styles.userName}>{unregUser.name}</span>
                <span className={styles.userRoleBadge}>{unregUser.role}</span>
            </div>

            <div className={styles.userActions} style={{ gap: '0.5rem' }}>
                <select
                    className={styles.roleSelect}
                    style={{ maxWidth: '160px' }}
                    value={linkTargetUpdates[unregUser.uid] || ""}
                    onChange={(e) => setLinkTargetUpdates(prev => ({ ...prev, [unregUser.uid]: e.target.value }))}
                    disabled={mergeEligibilityLoading || mergeTargetUsers.length === 0}
                >
                    <option value="" disabled>Merge into account...</option>
                    {mergeTargetUsers.map(emp => (
                        <option key={emp.uid} value={emp.uid}>{emp.username || emp.name} ({emp.role})</option>
                    ))}
                </select>
                {mergeEligibilityLoading ? (
                    <span className={styles.mergeHint}>Checking data...</span>
                ) : mergeTargetUsers.length === 0 ? (
                    <span className={styles.mergeHint}>No empty active accounts</span>
                ) : null}
                <button
                    className={`${styles.actionBtn} ${styles.approveBtn}`}
                    onClick={() => handleLinkAccount(unregUser)}
                    disabled={loadingId === unregUser.uid || mergeEligibilityLoading || !linkTargetUpdates[unregUser.uid]}
                    title="Merge this temporary profile into a real account"
                >
                    Merge
                </button>
                <button
                    className={`${styles.actionBtn} ${styles.denyBtn}`}
                    onClick={() => handleDeleteUnregistered(unregUser.uid)}
                    disabled={loadingId === unregUser.uid}
                    title="Delete temporary profile"
                >
                    ✕
                </button>
            </div>
        </div>
    );

    return (
        <div className={styles.container}>

            {/* Pending Approvals */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>
                        Pending Approvals
                        {pendingUsers.length > 0 && <span className={styles.badge}>{pendingUsers.length}</span>}
                    </h3>
                </div>

                {pendingUsers.length === 0 ? (
                    <div className={styles.emptyState}>No pending sign-ups.</div>
                ) : (
                    <div className={styles.userList}>
                        {pendingUsers.map(user => <UserRow key={user.uid} user={user} isPending={true} />)}
                    </div>
                )}
            </div>

            {/* Active Team */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Active Team</h3>
                </div>

                {activeUsers.length === 0 ? (
                    <div className={styles.emptyState}>No active employees.</div>
                ) : (
                    <div className={styles.userList}>
                        {activeUsers.map(user => <UserRow key={user.uid} user={user} isPending={false} />)}
                    </div>
                )}
            </div>

            {/* Temporary Staff Profiles */}
            {unregisteredStaff.length > 0 && (
                <div className={styles.sectionCard} style={{ background: 'rgba(147, 51, 234, 0.03)', borderColor: 'rgba(147, 51, 234, 0.2)' }}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Temporary Staff Profiles</h3>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
                            Staff added during shift setup before they had an account. Merge one into a real active account to transfer saved history.
                        </p>
                    </div>
                    <div className={styles.userList}>
                        {unregisteredStaff.map(u => <UnregisteredRow key={u.uid} unregUser={u} />)}
                    </div>
                </div>
            )}

            {/* Inactive Employees */}
            {inactiveUsers.length > 0 && (
                <div className={styles.sectionCard} style={{ opacity: 0.8 }}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Inactive Employees</h3>
                    </div>
                    <div className={styles.userList}>
                        {inactiveUsers.map(user => <UserRow key={user.uid} user={user} isPending={false} />)}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamManagement;
