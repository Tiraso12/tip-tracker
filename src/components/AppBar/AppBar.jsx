import React from "react";
import AccountSheet from "../Account/AccountSheet";

// The app bar, shared by BOTH halves of the app.
//
// It used to belong to the shift workspace alone, and the employee side had no
// chrome at all - an eyebrow, a title and a Log Out button. That was survivable
// only while the two audiences were disjoint. They are not: a captain enters the
// restaurant's money AND is paid out of the pool, so they need both screens and
// a way between them. A pay view without this bar is a room with no door.
//
// Layout, unchanged from where it grew up: home at the left edge at every width
// as a full 44x44 target, the day (or the week) and the account avatar at the
// right. px-3 below sm because at 320px those three only clear the viewport with
// the tighter inset. z-40 so the account sheet, which opens out of this bar as a
// bottom sheet, lands above the floating z-30 Edit/Cancel/Done controls.
//
// HOME MEANS THE VIEWER'S OWN HOME, and that is not the same place for everyone:
// a captain is paid from the pool, so home is their pay; the manager is not, so
// home is today's shifts. The caller decides and passes the label with the
// handler, because the two must never disagree.

function HomeIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
            <path d="M9.5 21v-6h5v6" />
        </svg>
    );
}

function AppBar({ onHome, homeLabel, homeTitle, tier, dateControl = null, accountItems = [], pendingApprovalCount = 0 }) {
    return (
        <header className="sticky top-0 z-40 h-14 px-3 sm:px-6 flex items-center justify-between bg-[var(--color-bar-bg)] border-b border-[var(--color-bar-hover)]">
            <div className="flex items-center gap-2 sm:gap-3">
                <button
                    type="button"
                    onClick={onHome}
                    aria-label={homeLabel}
                    title={homeTitle || homeLabel}
                    className="h-11 w-11 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-bar-ink)]/75 hover:text-[var(--color-bar-ink-soft)] hover:bg-[var(--color-bar-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-bar-mint)]/40"
                >
                    <HomeIcon />
                </button>
                {/* Brand is kept for desktop coherence but dropped on the phone
                    bar - there the day and the account avatar are all the width
                    allows. */}
                <span className="hidden sm:inline font-display text-lg font-medium tracking-tight text-[var(--color-bar-ink)]">
                    Tip Tracker
                </span>
                {/* Names the tier the viewer actually holds, and nothing when
                    they hold none - an employee is shown no badge. The shared
                    `Badge` component is filled for light card surfaces; here on
                    the dark bar it uses an outline instead - transparent with a
                    mint border and mint text - matching the kit's tier pill
                    exactly: 2px/8px padding, 11px text, 0.08em tracking. `leading-
                    none` is load-bearing, not decorative - the kit's own chip
                    never sets a line-height, so it renders at the browser's tight
                    ~1.2 default, while this app's ambient 1.5 body line-height
                    inflated the same padding into a visibly taller pill (22.5px
                    measured vs the kit's own ~17px) before this was added. Kit
                    shows this at every width (it drops the wordmark on a narrow
                    bar instead, see above) - so unlike the wordmark this does not
                    hide on a phone. */}
                {tier ? (
                    <span className="inline-flex items-center rounded-full border border-[var(--color-bar-mint)]/35 px-2 py-0.5 text-[11px] leading-none font-medium uppercase tracking-[0.08em] text-[var(--color-bar-mint)]">
                        {tier}
                    </span>
                ) : null}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
                {dateControl}
                {/* Who you are, Log Out, and the destinations that do not deserve
                    a permanent phone control. On a phone this avatar is the only
                    door to any of them. */}
                <AccountSheet items={accountItems} pendingApprovalCount={pendingApprovalCount} />
            </div>
        </header>
    );
}

export default AppBar;
