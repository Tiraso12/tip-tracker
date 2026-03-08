import React, { useState, useEffect } from 'react';
import styles from './TeamManagement.module.css';
import { db } from '../../config/firebase';
import { doc, updateDoc, deleteDoc, collection, getDocs, getDoc, setDoc } from 'firebase/firestore';

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
    const pendingUsers = allEmployees.filter(emp => emp.status === "pending");
    const activeUsers = allEmployees.filter(emp => emp.status === "active" && emp.role !== "admin");
    const inactiveUsers = allEmployees.filter(emp => emp.status === "inactive" && emp.role !== "admin");

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

    const handleDeleteUser = async (uid) => {
        if (!window.confirm("Are you sure you want to permanently delete this user?")) return;
        setLoadingId(uid);
        try {
            await deleteDoc(doc(db, 'users', uid));
            // Note: This only deletes the firestore doc, not the Firebase Auth account.
            // A full deletion requires an admin SDK backend. For now, deleting the doc removes their access.
            await refreshEmployees();
        } catch (error) {
            console.error("Failed to delete user:", error);
            alert("Error deleting user.");
        } finally {
            setLoadingId(null);
        }
    };

    const handleLinkAccount = async (unregUser) => {
        const targetRealUid = linkTargetUpdates[unregUser.uid];
        if (!targetRealUid) return alert("Select a registered account to link to first.");

        const realUser = allEmployees.find(e => e.uid === targetRealUid);
        if (!realUser) return;

        if (!window.confirm(`Merge records from '${unregUser.name}' into ${realUser.username || realUser.name}?\n\nThis will transfer all past shift history and tips.`)) return;

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
            alert("Account successfully linked and shifts transferred!");

        } catch (error) {
            console.error("Failed to link account:", error);
            alert("Error linking account.");
        } finally {
            setLoadingId(null);
        }
    };

    const handleDeleteUnregistered = async (uid) => {
        if (!window.confirm("Delete this Unregistered profile? Any shifts they were previously assigned to will keep their static UID string, but they will no longer appear in the system.")) return;
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
                            onClick={() => handleDeleteUser(user.uid)}
                            disabled={loadingId === user.uid}
                        >
                            Deny
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            className={`${styles.actionBtn} ${user.status === 'active' ? styles.denyBtn : styles.approveBtn}`}
                            onClick={() => handleUpdateUser(user.uid, { status: user.status === 'active' ? 'inactive' : 'active' })}
                            disabled={loadingId === user.uid}
                        >
                            {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                            className={`${styles.actionBtn} ${styles.denyBtn}`}
                            onClick={() => handleDeleteUser(user.uid)}
                            disabled={loadingId === user.uid}
                            style={{ marginLeft: '0.5rem' }}
                            title="Permanently remove user"
                        >
                            Delete
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
                >
                    <option value="" disabled>Link to account...</option>
                    {allEmployees.filter(e => e.status === 'active' && e.role !== 'admin').map(emp => (
                        <option key={emp.uid} value={emp.uid}>{emp.username || emp.name} ({emp.role})</option>
                    ))}
                </select>
                <button
                    className={`${styles.actionBtn} ${styles.approveBtn}`}
                    onClick={() => handleLinkAccount(unregUser)}
                    disabled={loadingId === unregUser.uid || !linkTargetUpdates[unregUser.uid]}
                    title="Merge shift history into real account"
                >
                    Link 🔗
                </button>
                <button
                    className={`${styles.actionBtn} ${styles.denyBtn}`}
                    onClick={() => handleDeleteUnregistered(unregUser.uid)}
                    disabled={loadingId === unregUser.uid}
                    title="Delete placeholder"
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

            {/* Unregistered Accounts */}
            {unregisteredStaff.length > 0 && (
                <div className={styles.sectionCard} style={{ background: 'rgba(147, 51, 234, 0.03)', borderColor: 'rgba(147, 51, 234, 0.2)' }}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Unregistered Staff</h3>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
                            Temporary accounts. Link them to real active accounts to merge shift history.
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
