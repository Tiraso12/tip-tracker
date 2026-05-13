import React from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Login.module.css';

const PendingApproval = () => {
    const { user, logout } = useAuth();
    const isInactive = user?.status === 'inactive';

    return (
        <div className={styles.container}>
            <div className={styles.card} style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                <h2 className={styles.title} style={{ marginBottom: '1rem' }}>
                    {isInactive ? 'Account Inactive' : 'Account Pending'}
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.5' }}>
                    {isInactive
                        ? 'Your account is currently inactive. Contact your manager if you need access restored.'
                        : 'Your account has been created successfully, but it needs to be approved by an administrator before you can access your dashboard.'}
                </p>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.875rem' }}>
                    {isInactive ? 'You can log out and check back after your account is reactivated.' : 'Check back later or contact your manager.'}
                </p>
                <button onClick={logout} className={styles.button}>
                    Log Out
                </button>
            </div>
        </div>
    );
};

export default PendingApproval;
