import React from "react";

/**
 * Screen-level indeterminate progress line.
 *
 * One bar per screen, driven by any slow action (see PendingActionsContext), so
 * the wait is cued without taking the content away from the user. Always
 * mounted so it can fade rather than snap in and out.
 */
export default function TopProgressBar({ active = false, label = "Working…" }) {
    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-busy={active ? "true" : "false"}
            aria-hidden={active ? undefined : "true"}
            data-testid="top-progress-bar"
            data-active={active ? "true" : "false"}
            className={
                "fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden pointer-events-none " +
                "transition-opacity duration-200 " +
                (active ? "opacity-100" : "opacity-0")
            }
        >
            <div
                className={
                    "h-full w-full origin-left bg-[var(--color-accent)] " +
                    (active ? "top-progress-indicator" : "")
                }
            />
        </div>
    );
}
