import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button, Card } from '../ui';

const PendingApproval = () => {
    const { user, logout } = useAuth();
    const isInactive = user?.status === 'inactive';
    const isProfileError = user?.status === 'profile_error';

    return (
        <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--color-bg)]">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <span className="font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">
                        TipTracker
                    </span>
                </div>

                <Card className="!p-8 text-center">
                    <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </div>

                    <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">
                        {isProfileError ? 'Account Unavailable' : isInactive ? 'Account Inactive' : 'Account Pending'}
                    </h1>

                    <p className="mt-3 text-sm text-[var(--color-ink-soft)] leading-relaxed">
                        {isProfileError
                            ? 'Your account profile could not be verified. Log out and try again, or contact your manager.'
                            : isInactive
                            ? 'Your account is currently inactive. Contact your manager if you need access restored.'
                            : 'Your account has been created, but it needs to be approved by an administrator before you can access your dashboard.'}
                    </p>

                    <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
                        {isProfileError
                            ? 'Access is blocked until the profile check succeeds.'
                            : isInactive
                            ? 'You can log out and check back after your account is reactivated.'
                            : 'Check back later or contact your manager.'}
                    </p>

                    <Button onClick={logout} variant="secondary" className="mt-6">
                        Log Out
                    </Button>
                </Card>
            </div>
        </main>
    );
};

export default PendingApproval;
