import React from "react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui";

function Header() {
    const { user, logout } = useAuth();

    return (
        <header className="flex items-end justify-between gap-4 pb-6 mb-2 border-b border-[var(--color-line)]">
            <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                    {user?.username ? `Signed in as ${user.username}` : "Welcome"}
                </span>
                <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-[var(--color-ink)]">
                    Tip Tracker
                </h1>
                <p className="text-sm text-[var(--color-ink-soft)]">
                    Manage your money, design your dream life.
                </p>
            </div>
            {user && (
                <Button onClick={logout} variant="secondary" size="sm">
                    Log Out
                </Button>
            )}
        </header>
    );
}

export default Header;
