import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { tierLabel } from "../../utils/permissions";
import {
    updateOwnLoginHandle,
    updateOwnWorkName,
} from "../../utils/accountProfilePersistence";
import AppBar from "../AppBar/AppBar";
import { Button, Card, Input } from "../ui";
import IdentityCard from "./IdentityCard";

const ACCOUNT_ICON = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
);

const SHIFTS_ICON = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

function friendlyError(error, fallback) {
    const code = error?.code || "";
    if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Your current password is incorrect.";
    if (code.includes("weak-password")) return "Choose a stronger password with at least 8 characters.";
    if (code.includes("permission-denied") || code.includes("already-exists")) return "That login handle is already in use. Choose another one.";
    return error?.message?.replace("Firebase:", "").replace(/\s*\([^)]*\)\.?$/, "") || fallback;
}

function Dialog({ title, description, children, onClose }) {
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
            <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-[var(--color-ink)]/35" />
            <section role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" className="relative w-full max-w-md rounded-t-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[0_20px_60px_rgba(15,23,27,0.24)] sm:rounded-[var(--radius-lg)] sm:p-6">
                <h2 id="account-dialog-title" className="font-display text-xl font-medium tracking-tight text-[var(--color-ink)]">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-soft)]">{description}</p>
                <div className="mt-5">{children}</div>
            </section>
        </div>
    );
}

function PasswordDialog({ onClose }) {
    const { changePassword } = useAuth();
    const [currentPassword, setCurrentPassword] = useState("");
    const [nextPassword, setNextPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setError("");
        if (nextPassword !== confirmPassword) {
            setError("The new passwords do not match.");
            return;
        }
        setBusy(true);
        try {
            await changePassword(currentPassword, nextPassword);
            setSaved(true);
        } catch (e) {
            setError(friendlyError(e, "Your password could not be changed."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog title="Change password" description="Confirm your current password before choosing a new one." onClose={onClose}>
            {saved ? (
                <div>
                    <p className="text-sm text-[var(--color-success)]" role="status">Your password has been changed.</p>
                    <Button className="mt-5 w-full" onClick={onClose}>Done</Button>
                </div>
            ) : (
                <form className="space-y-4" onSubmit={submit}>
                    {error ? <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]" role="alert">{error}</p> : null}
                    <Input id="account-current-password" label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                    <Input id="account-new-password" label="New password" type="password" autoComplete="new-password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} minLength={8} required />
                    <Input id="account-confirm-password" label="Confirm new password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
                        <Button type="submit" disabled={busy}>{busy ? "Changing…" : "Change password"}</Button>
                    </div>
                </form>
            )}
        </Dialog>
    );
}

function HandleDialog({ onClose }) {
    const { user, updateSessionProfile } = useAuth();
    const [username, setUsername] = useState(user?.username || "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const submit = async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            const result = await updateOwnLoginHandle({
                db,
                uid: user.uid,
                email: user.email,
                oldUsername: user.username,
                newUsername: username,
            });
            updateSessionProfile({ username: result.username });
            onClose();
        } catch (e) {
            setError(friendlyError(e, "Your login handle could not be changed."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            title="Change login handle"
            description={`Your current handle, “${user?.username},” will be released. Anyone can claim it after this change. You will sign in with the new handle instead; your email login and current session stay unchanged.`}
            onClose={onClose}
        >
            <form className="space-y-4" onSubmit={submit}>
                {error ? <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]" role="alert">{error}</p> : null}
                <Input id="account-login-handle" label="New login handle" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={80} autoComplete="username" required />
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button type="submit" disabled={busy}>{busy ? "Changing…" : "Release old and change"}</Button>
                </div>
            </form>
        </Dialog>
    );
}

function AccountView({ onHome, homeLabel, homeTitle, onOpenWorkspace }) {
    const { user, updateSessionProfile } = useAuth();
    const [firstName, setFirstName] = useState(user?.firstName || "");
    const [lastName, setLastName] = useState(user?.lastName || "");
    const [editingName, setEditingName] = useState(false);
    const [nameBusy, setNameBusy] = useState(false);
    const [nameError, setNameError] = useState("");
    const [nameNotice, setNameNotice] = useState("");
    const [dialog, setDialog] = useState(null);

    useEffect(() => {
        setFirstName(user?.firstName || "");
        setLastName(user?.lastName || "");
    }, [user?.firstName, user?.lastName]);

    const accountItems = useMemo(() => [
        { key: "account", label: "Your account", icon: ACCOUNT_ICON, active: true },
        ...(onOpenWorkspace ? [{ key: "shifts", label: "Shifts", icon: SHIFTS_ICON, onClick: onOpenWorkspace }] : []),
    ], [onOpenWorkspace]);

    const saveName = async (event) => {
        event.preventDefault();
        setNameError("");
        setNameNotice("");
        setNameBusy(true);
        try {
            const result = await updateOwnWorkName({ db, uid: user.uid, firstName, lastName });
            updateSessionProfile({ firstName: result.firstName, lastName: result.lastName });
            setEditingName(false);
            setNameNotice(result.openShiftDates.length > 0
                ? `Name saved and updated on ${result.openShiftDates.length} open floor ${result.openShiftDates.length === 1 ? "plan" : "plans"}.`
                : "Name saved.");
        } catch (e) {
            setNameError(friendlyError(e, "Your name could not be saved."));
        } finally {
            setNameBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--color-bg)]">
            <AppBar
                onHome={onHome}
                homeLabel={homeLabel}
                homeTitle={homeTitle}
                tier={tierLabel(user)}
                accountItems={accountItems}
            />

            <main className="px-4 py-5 sm:px-8 lg:py-8">
                <div className="mx-auto max-w-3xl space-y-4">
                    <header className="border-b border-[var(--color-line)] pb-4 sm:pb-6">
                        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">Account</span>
                        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight text-[var(--color-ink)]">Your account</h1>
                        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">See and manage the identity you use at work.</p>
                    </header>

                    <IdentityCard person={user} mode="own" />

                    {nameNotice ? <p className="rounded-[var(--radius-sm)] bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-success)]" role="status">{nameNotice}</p> : null}

                    <Card className="!p-0 overflow-hidden">
                        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                            <div>
                                <h2 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">Work name</h2>
                                <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">Your first name appears on the floor plan. Your full name appears on identity and pay records.</p>
                            </div>
                            {!editingName ? <Button variant="secondary" onClick={() => setEditingName(true)}>Edit name</Button> : null}
                        </div>
                        {editingName ? (
                            <form className="space-y-4 border-t border-[var(--color-line)] px-5 py-4 sm:px-6" onSubmit={saveName}>
                                {nameError ? <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]" role="alert">{nameError}</p> : null}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Input id="account-first-name" label="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={80} autoComplete="given-name" required />
                                    <Input id="account-last-name" label="Last name (optional)" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={80} autoComplete="family-name" />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button type="button" variant="secondary" disabled={nameBusy} onClick={() => { setEditingName(false); setFirstName(user.firstName); setLastName(user.lastName); setNameError(""); }}>Cancel</Button>
                                    <Button type="submit" disabled={nameBusy}>{nameBusy ? "Saving…" : "Save name"}</Button>
                                </div>
                            </form>
                        ) : null}
                    </Card>

                    <Card className="!p-0 overflow-hidden">
                        <div className="border-b border-[var(--color-line)] px-5 py-4 sm:px-6">
                            <h2 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">Signing in</h2>
                            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">Manage the credentials that open your account.</p>
                        </div>
                        <div className="flex flex-col gap-3 border-b border-[var(--color-line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                            <div><p className="text-sm font-medium text-[var(--color-ink)]">Login handle</p><p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{user.username}</p></div>
                            <Button variant="secondary" onClick={() => setDialog("handle")}>Change handle</Button>
                        </div>
                        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                            <div><p className="text-sm font-medium text-[var(--color-ink)]">Password</p><p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">Re-authentication is required.</p></div>
                            <Button variant="secondary" onClick={() => setDialog("password")}>Change password</Button>
                        </div>
                    </Card>

                    <p className="px-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">Your manager controls job title, account status, Supervisor rights, and email changes.</p>
                </div>
            </main>

            {dialog === "password" ? <PasswordDialog onClose={() => setDialog(null)} /> : null}
            {dialog === "handle" ? <HandleDialog onClose={() => setDialog(null)} /> : null}
        </div>
    );
}

export default AccountView;
