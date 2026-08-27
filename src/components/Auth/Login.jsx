import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, Input } from '../ui';

const EyeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);

const EyeOffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);

function PasswordField({ id, label, name, value, onChange, showPassword, onToggle, autoComplete, placeholder }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label
                htmlFor={id}
                className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]"
            >
                {label}
            </label>
            <div className="relative">
                <input
                    id={id}
                    name={name}
                    type={showPassword ? "text" : "password"}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    className="block w-full h-10 pl-3 pr-10 text-base bg-[var(--color-surface)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] border border-[var(--color-line)] rounded-[var(--radius-sm)] transition-colors duration-150 hover:border-[var(--color-line-strong)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/15"
                />
                <button
                    type="button"
                    onClick={onToggle}
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] rounded-[var(--radius-xs)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            </div>
        </div>
    );
}

const Login = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [username, setUsername] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, register, resetPassword, authNotice, clearAuthNotice } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        clearAuthNotice();
        setLoading(true);
        setResetSent(false);

        try {
            if (isForgotPassword) {
                if (!email) throw new Error("Please enter your email address");
                await resetPassword(email);
                setResetSent(true);
            } else if (isLogin) {
                if (!email || !password) throw new Error("Please fill in all fields.");
                await login(email, password, rememberMe);
            } else {
                if (!email || !password || !username || !firstName) throw new Error("Please fill in all required fields.");
                if (password !== confirmPassword) throw new Error("Passwords do not match");
                await register(email, password, username, firstName, lastName);
            }
        } catch (err) {
            console.error(err);
            setError(err.message.replace('Firebase:', '').replace('auth/', '').replace(/-/g, ' '));
        } finally {
            setLoading(false);
        }
    };

    const heading = isForgotPassword
        ? 'Reset Password'
        : isLogin
            ? 'Welcome Back'
            : 'Create Account';

    const subheading = isForgotPassword
        ? 'Enter the email tied to your account.'
        : isLogin
            ? 'Sign in to track your shifts and payouts.'
            : 'Create an account to start tracking your tips.';

    const togglePassword = () => setShowPassword((s) => !s);

    return (
        <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--color-bg)]">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <span className="font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">
                        Tip Tracker
                    </span>
                </div>

                <Card className="!p-8">
                    <header className="mb-6">
                        <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">
                            {heading}
                        </h1>
                        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                            {subheading}
                        </p>
                    </header>

                    {(error || authNotice) && (
                        <div className="mb-4 px-3 py-2 text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-[var(--radius-sm)]">
                            {error || authNotice}
                        </div>
                    )}

                    {resetSent && (
                        <div className="mb-4 px-3 py-2 text-sm text-[var(--color-success)] bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 rounded-[var(--radius-sm)]">
                            Password reset link sent. Please check your email.
                        </div>
                    )}

                    <form onSubmit={handleSubmit} autoComplete="on" className="flex flex-col gap-4">
                        <Input
                            id="login-email"
                            name="username"
                            label={isLogin ? 'Username or Email' : 'Email'}
                            type={isLogin ? "text" : "email"}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={isLogin ? "Username or email" : "email@example.com"}
                            autoComplete={isLogin ? "username" : "email"}
                        />

                        {!isLogin && (
                            <>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Input
                                        id="signup-first-name"
                                        name="given-name"
                                        label="First name"
                                        type="text"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="Sonia"
                                        autoComplete="given-name"
                                        maxLength={80}
                                        required
                                    />
                                    <Input
                                        id="signup-last-name"
                                        name="family-name"
                                        label="Last name (optional)"
                                        type="text"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="Alvarez Garcia"
                                        autoComplete="family-name"
                                        maxLength={80}
                                    />
                                </div>
                                <Input
                                    id="login-username"
                                    name="username"
                                    label="Login handle"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Choose a login handle"
                                    autoComplete="username"
                                    required
                                />
                            </>
                        )}

                        {!isForgotPassword && (
                            <PasswordField
                                id="login-password"
                                name="password"
                                label="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                showPassword={showPassword}
                                onToggle={togglePassword}
                                autoComplete={isLogin ? "current-password" : "new-password"}
                                placeholder="Enter your password"
                            />
                        )}

                        {!isLogin && !isForgotPassword && (
                            <PasswordField
                                id="login-confirm"
                                name="confirm-password"
                                label="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                showPassword={showPassword}
                                onToggle={togglePassword}
                                autoComplete="new-password"
                                placeholder="Re-enter your password"
                            />
                        )}

                        {isLogin && !isForgotPassword && (
                            <div className="flex items-center justify-between gap-3 -mt-1">
                                <label className="inline-flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="h-4 w-4 rounded border-[var(--color-line)] accent-[var(--color-accent)]"
                                    />
                                    Remember me
                                </label>
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(true); setError(''); setResetSent(false); }}
                                    className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-accent)] transition-colors"
                                >
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        <Button type="submit" disabled={loading} size="lg" className="mt-2">
                            {loading
                                ? 'Processing…'
                                : isForgotPassword
                                    ? 'Send Reset Link'
                                    : isLogin
                                        ? 'Log In'
                                        : 'Create Account'}
                        </Button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-[var(--color-line)] text-center text-sm text-[var(--color-ink-soft)]">
                        {isForgotPassword ? (
                            <button
                                type="button"
                                onClick={() => { setIsForgotPassword(false); setError(''); setResetSent(false); }}
                                className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
                            >
                                Back to login
                            </button>
                        ) : (
                            <>
                                {isLogin ? "Don't have an account? " : "Already have an account? "}
                                <button
                                    type="button"
                                    onClick={() => { setIsLogin(!isLogin); setError(''); }}
                                    className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
                                >
                                    {isLogin ? 'Sign up' : 'Log in'}
                                </button>
                            </>
                        )}
                    </div>
                </Card>
            </div>
        </main>
    );
};

export default Login;
