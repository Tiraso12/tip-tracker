import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { roleLabel } from "../../utils/roleLabels";

// The account sheet: who you are signed in as, and the once-a-shift actions that
// belong with that. It exists to get Log Out out of the top app bar - a 69px
// word-labelled button was taking 17.7% of a 390px bar and, on the money-entry
// screen, was the ONLY word-labelled control on screen, so it read as the primary
// action while an admin typed a shift's money.
//
// The trigger is a 44x44 initials avatar in the bar's right slot. On a phone the
// panel is a bottom sheet (thumb-reachable, the platform convention for an account
// menu); from `sm` up it is a dropdown anchored under the avatar.
//
// `items` is a nav slot rendered above the sign-out block, for destinations that
// do not deserve a permanent phone control. Team lives here: it is the admin's
// approve-a-new-hire screen, visited at a desk maybe twice a week, and it was the
// only reason a phone carried a workspace menu at all. On a phone this sheet is
// now the ONLY way to reach it, so the slot is load-bearing, not decoration.

function initialsFor(name) {
    const parts = String(name || "").trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AccountSheet({ items = [] }) {
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);

    const close = useCallback(({ restoreFocus = true } = {}) => {
        setOpen(false);
        if (restoreFocus) triggerRef.current?.focus();
    }, []);

    // Escape closes from anywhere, including from inside the panel.
    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, close]);

    // Move focus into the sheet on open so a keyboard or screen-reader user is not
    // left behind on the trigger with the panel painted over the page.
    useEffect(() => {
        if (!open) return;
        panelRef.current?.querySelector("button")?.focus();
    }, [open]);

    const name = user?.username || "Signed in";
    const initials = initialsFor(user?.username);

    const runItem = (item) => {
        close({ restoreFocus: false });
        item.onClick?.();
    };

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (open ? close() : setOpen(true))}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Account: ${name}. Open account menu.`}
                title="Account"
                className={
                    "h-11 w-11 inline-flex items-center justify-center rounded-full border text-xs font-semibold tracking-tight " +
                    "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                    (open
                        ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                        : "border-[var(--color-line)] bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]")
                }
            >
                <span aria-hidden="true">{initials}</span>
            </button>

            {open ? (
                <>
                    {/* Scrim: dims the page behind the phone sheet, and is the
                        click-anywhere-to-dismiss target at every width. */}
                    <div
                        aria-hidden="true"
                        onClick={() => close()}
                        className="fixed inset-0 z-30 bg-[var(--color-ink)]/25 sm:bg-transparent"
                    />
                    <div
                        ref={panelRef}
                        role="menu"
                        aria-label="Account"
                        className={
                            "z-40 overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface)] " +
                            "shadow-[0_16px_40px_rgba(15,23,27,0.16)] " +
                            // Phone: bottom sheet, full width, clear of the home indicator.
                            "fixed inset-x-0 bottom-0 rounded-t-[var(--radius-lg)] pb-[max(0.5rem,env(safe-area-inset-bottom))] " +
                            // sm and up: dropdown anchored under the avatar.
                            "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64 sm:rounded-[var(--radius-md)] sm:pb-0"
                        }
                    >
                        {/* Grab handle: reads as a sheet on a phone, not a stuck panel. */}
                        <div aria-hidden="true" className="sm:hidden flex justify-center pt-2 pb-1">
                            <span className="h-1 w-9 rounded-full bg-[var(--color-line-strong)]" />
                        </div>

                        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-line)]">
                            <span
                                aria-hidden="true"
                                className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)]"
                            >
                                {initials}
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[var(--color-ink)]">{name}</p>
                                <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                    {roleLabel(user?.role)}
                                </p>
                            </div>
                        </div>

                        {items.length > 0 ? (
                            <div className="p-1.5 border-b border-[var(--color-line)]">
                                {items.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => runItem(item)}
                                        aria-current={item.active ? "page" : undefined}
                                        className={
                                            "w-full min-h-11 flex items-center gap-3 px-2.5 rounded-[var(--radius-sm)] text-sm text-left " +
                                            "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                                            (item.active
                                                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium"
                                                : "text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]")
                                        }
                                    >
                                        {item.icon ? <span className="shrink-0 text-[var(--color-ink-muted)]">{item.icon}</span> : null}
                                        <span className="truncate">{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        <div className="p-1.5">
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    close({ restoreFocus: false });
                                    logout();
                                }}
                                className={
                                    "w-full min-h-11 flex items-center gap-3 px-2.5 rounded-[var(--radius-sm)] text-sm text-left " +
                                    "text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-soft)] " +
                                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/30"
                                }
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                Log Out
                            </button>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}

export default AccountSheet;
