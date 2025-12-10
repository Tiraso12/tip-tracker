import React from "react";
import styles from "./Header.module.css"


function Header() {
    return (
        <div className={styles.header}>
            <div className={styles.content}>
                <h1 className={styles.title}>Tip Tracker</h1>
                <p className={styles.subtitle}>**Manage your money, design your dream life.**</p>
            </div>
            <div className={styles.actions}>
                <button className={styles.logoutButton}>Logout (Dev User)</button>
            </div>
        </div>
    )
}

export default Header;