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

export default Login;
