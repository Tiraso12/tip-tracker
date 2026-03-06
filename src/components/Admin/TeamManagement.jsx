import React, { useState } from 'react';
import styles from './TeamManagement.module.css';
import { db } from '../../config/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';

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

    // Split users into lists
    const pendingUsers = allEmployees.filter(emp => emp.status === "pending");
    const activeUsers = allEmployees.filter(emp => emp.status === "active");
    const inactiveUsers = allEmployees.filter(emp => emp.status === "inactive");

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
        if (!window.confirm("Are you sure you want to permanently delete this pending request?")) return;
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
                    <button
                        className={`${styles.actionBtn} ${user.status === 'active' ? styles.denyBtn : styles.approveBtn}`}
                        onClick={() => handleUpdateUser(user.uid, { status: user.status === 'active' ? 'inactive' : 'active' })}
                        disabled={loadingId === user.uid}
                    >
                        {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </button>
                )}
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
