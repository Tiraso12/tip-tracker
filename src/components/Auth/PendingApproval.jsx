import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Login.module.css';

const PendingApproval = () => {
    const { logout } = useAuth();

    return (
        <div className={styles.container}>
            <div className={styles.card} style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                <h2 className={styles.title} style={{ marginBottom: '1rem' }}>Account Pending</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.5' }}>
                    Your account has been created successfully, but it needs to be approved by an administrator before you can access your dashboard.
                </p>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.875rem' }}>
                    Check back later or contact your manager.
                </p>
                <button onClick={logout} className={styles.button}>
                    Log Out
                </button>
            </div>
        </div>
    );
};

export default PendingApproval;
