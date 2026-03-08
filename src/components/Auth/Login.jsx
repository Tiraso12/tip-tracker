import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Login.module.css';

const Login = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [username, setUsername] = useState(''); // Only for register
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, register, resetPassword } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        setResetSent(false);

        try {
            if (isForgotPassword) {
                if (!email) throw new Error("Please enter your email address");
                await resetPassword(email);
                setResetSent(true);
            } else if (isLogin) {
                if (!email || !password) throw new Error("Please fill in fields");
                await login(email, password);
            } else {
                if (!email || !password || !username) throw new Error("Please fill in fields");
                if (password !== confirmPassword) throw new Error("Passwords do not match");
                await register(email, password, username);
            }
        } catch (err) {
            console.error(err);
            setError(err.message.replace('Firebase:', '').replace('auth/', '').replace(/-/g, ' '));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className={styles.container}>
            <form className={styles.card} onSubmit={handleSubmit}>
                <h2 className={styles.title}>
                    {isForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome Back' : 'Create Account')}
                </h2>

                {error && (
                    <div style={{ color: 'var(--danger)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '1rem' }}>
                        {error}
                    </div>
                )}

                {resetSent && (
                    <div style={{ color: 'var(--success)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '1rem' }}>
                        Password reset link sent! Please check your email.
                    </div>
                )}

                <div className={styles.inputGroup}>
                    <label htmlFor="login-email" className={styles.label}>
                        {isLogin ? 'Username or Email' : 'Email'}
                    </label>
                    <input
                        id="login-email"
                        type={isLogin ? "text" : "email"}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={styles.input}
                        placeholder={isLogin ? "Username or email" : "email@example.com"}
                    />
                </div>

                {!isLogin && (
                    <div className={styles.inputGroup}>
                        <label htmlFor="login-username" className={styles.label}>Username</label>
                        <input
                            id="login-username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={styles.input}
                            placeholder="Display Name"
                        />
                    </div>
                )}

                {!isForgotPassword && (
                    <div className={styles.inputGroup}>
                        <label htmlFor="login-password" className={styles.label}>Password</label>
                        <div className={styles.passwordWrapper}>
                            <input
                                id="login-password"
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={styles.input}
                                placeholder="******"
                            />
                            <button
                                type="button"
                                className={styles.passwordToggleBtn}
                                onClick={() => setShowPassword(!showPassword)}
                                title={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? "🙈" : "👁️"}
                            </button>
                        </div>
                    </div>
                )}

                {(!isLogin && !isForgotPassword) && (
                    <div className={styles.inputGroup}>
                        <label htmlFor="login-confirm" className={styles.label}>Confirm Password</label>
                        <div className={styles.passwordWrapper}>
                            <input
                                id="login-confirm"
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={styles.input}
                                placeholder="******"
                            />
                            <button
                                type="button"
                                className={styles.passwordToggleBtn}
                                onClick={() => setShowPassword(!showPassword)}
                                title={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? "🙈" : "👁️"}
                            </button>
                        </div>
                    </div>
                )}

                {isLogin && !isForgotPassword && (
                    <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                        <button
                            type="button"
                            onClick={() => { setIsForgotPassword(true); setError(''); setResetSent(false); }}
                            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
                        >
                            Forgot Password?
                        </button>
                    </div>
                )}

                <button type="submit" className={styles.button} disabled={loading}>
                    {loading ? 'Processing...' : (isForgotPassword ? 'Send Reset Link' : (isLogin ? 'Log In' : 'Sign Up'))}
                </button>

                <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {isForgotPassword ? (
                        <button
                            type="button"
                            onClick={() => { setIsForgotPassword(false); setError(''); setResetSent(false); }}
                            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', fontWeight: '600', padding: 0 }}
                        >
                            Back to Login
                        </button>
                    ) : (
                        <>
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <button
                                type="button"
                                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--primary-light)',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    padding: 0
                                }}
                            >
                                {isLogin ? 'Sign Up' : 'Log In'}
                            </button>
                        </>
                    )}
                </div>
            </form>
        </main>
    );
};


export default Login;
