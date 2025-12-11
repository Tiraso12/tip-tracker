import React from "react";
import styles from "./Header.module.css"
import { useAuth } from "../../context/AuthContext";


function Header() {
    const { user, logout } = useAuth();

    return (
        <div className={styles.header}>
            <div className={styles.content}>
                <h1 className={styles.title}>Tip Tracker</h1>
                <p className={styles.subtitle}>**Manage your money, design your dream life.**</p>
            </div>
            {user && (
                <div className={styles.actions}>
                    <button onClick={logout} className={styles.logoutButton}>
                        Logout ({user.username || 'User'})
                    </button>
                </div>
            )}
        </div>
    )
}

export default Header;