import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Login.module.css';

const PendingApproval = () => {
    const { user, logout, resendVerificationEmail } = useAuth();
    const [sending, setSending] = useState(false);
    const [sentMessage, setSentMessage] = useState('');

    const handleResend = async () => {
        setSending(true);
        setSentMessage('');
        try {
            await resendVerificationEmail();
            setSentMessage('Verification email sent! Check your inbox.');
        } catch (err) {
            console.error(err);
            setSentMessage('Failed to send email. You can try again later.');
        }
        setSending(false);
    };

    const handleRefresh = () => {
        window.location.reload();
    };

    if (!user?.emailVerified) {
        return (
            <div className={styles.container}>
                <div className={styles.card} style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✉️</div>
                    <h2 className={styles.title} style={{ marginBottom: '1rem' }}>Verify Your Email</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                        We sent a verification link to <strong>{user?.email}</strong>. Please click the link to verify your account.
                    </p>

                    {sentMessage && (
                        <p style={{ color: sentMessage.includes('Failed') ? 'var(--danger)' : 'var(--success)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                            {sentMessage}
                        </p>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <button onClick={handleRefresh} className={styles.button}>
                            I've Verified (Refresh)
                        </button>
                        <button
                            onClick={handleResend}
                            disabled={sending}
                            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
                        >
                            {sending ? 'Sending...' : 'Resend Verification Email'}
                        </button>
                        <button
                            onClick={logout}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', marginTop: '1rem', fontWeight: 600 }}
                        >
                            Log Out
                        </button>
                    </div>
                </div>
            </div>
        );
    }

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
