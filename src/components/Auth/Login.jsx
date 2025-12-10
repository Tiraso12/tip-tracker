<<<<<<< HEAD
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Auth.module.css';

const Login = ({ onSwitchToRegister }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            if (!username || !password) {
                throw new Error("Please fill in all fields");
            }
            await login(username, password);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className={styles.authContainer}>
            <div className={styles.authCard}>
                <h2 className={styles.title}>Welcome Back</h2>

                {error && <div className={styles.error}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={styles.input}
                            placeholder="Enter your username"
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={styles.input}
                            placeholder="Enter your password"
                        />
                    </div>

                    <button type="submit" className={styles.button}>
                        Login
                    </button>
                </form>

                <div className={styles.footer}>
                    Don't have an account?
                    <span className={styles.link} onClick={onSwitchToRegister}>
                        Register
                    </span>
                </div>
            </div>
        </div>
    );
};
=======
import React, { useState } from "react";
import styles from "./Login.module.css";

function Login({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        // Simulate login
        onLogin();
    };

    return (
        <div className={styles.container}>
            <form className={styles.card} onSubmit={handleSubmit}>
                <h2 className={styles.title}>Welcome Back</h2>

                <div className={styles.inputGroup}>
                    <label className={styles.label}>Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={styles.input}
                        placeholder="Enter your email"
                    />
                </div>

                <div className={styles.inputGroup}>
                    <label className={styles.label}>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={styles.input}
                        placeholder="Enter your password"
                    />
                </div>

                <button type="submit" className={styles.button}>
                    Log In
                </button>
            </form>
        </div>
    );
}
>>>>>>> develop

export default Login;
