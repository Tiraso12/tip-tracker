import React, { useCallback, useMemo, useState } from "react";
import AppBar from "../AppBar/AppBar";
import BarDatePill from "../Admin/BarDatePill";
import PayStatement from "./PayStatement";
import { useAuth } from "../../context/AuthContext";
import { tierLabel } from "../../utils/permissions";
import { formatMonthDayRange, getCurrentWeek, toDateKey } from "../../utils/dateUtils";

// A person's own pay, and the app's home for anyone who is paid out of the pool.
//
// A captain is two things at once: someone who enters the restaurant's money,
// and someone the restaurant pays. The app used to treat those as disjoint
// audiences, which meant a captain could see everyone's night and not their own
// week. They land here now, and reach the shift workspace from here - the same
// account sheet that carries Team in the workspace, pointing the other way.
//
// The bar is the workspace's own bar, not a copy: the day pill relabels itself
// to read the WEEK on this side, because the bar owns the date and a pay
// statement must not grow a second date control.

const WEEK_ICON = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

function PayView({ onOpenWorkspace }) {
    const { user } = useAuth();
    // Any day inside the week being read. The pill picks a day; the week it
    // falls in is what the statement shows.
    const [anchorDate, setAnchorDate] = useState(() => toDateKey(new Date()));

    const weekDates = useMemo(
        () => getCurrentWeek(new Date(`${anchorDate}T12:00:00`)),
        [anchorDate]
    );
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];

    // Home is this person's home, and for them that is their own pay, on the
    // week they are actually in - the same "home means now, not wherever you
    // browsed to" rule the workspace's home control follows.
    const handleHome = useCallback(() => setAnchorDate(toDateKey(new Date())), []);

    const accountItems = useMemo(() => {
        if (!onOpenWorkspace) return [];
        // The one destination on this side, for the people who hold both: the
        // shift workspace. An employee has no such item and no such screen.
        return [{
            key: "shifts",
            label: "Shifts",
            icon: WEEK_ICON,
            onClick: onOpenWorkspace,
        }];
    }, [onOpenWorkspace]);

    return (
        <div className="min-h-screen bg-[var(--color-bg)]">
            <AppBar
                onHome={handleHome}
                homeLabel="Go to my pay for this week"
                homeTitle="My pay"
                tier={tierLabel(user)}
                dateControl={
                    <BarDatePill selectedDate={anchorDate} onSelectDate={setAnchorDate} unit="week" />
                }
                accountItems={accountItems}
            />

            <main className="px-4 sm:px-8 py-5 lg:py-8">
                <div className="max-w-3xl mx-auto">
                    <PayStatement
                        person={user}
                        startDate={weekStart}
                        endDate={weekEnd}
                        eyebrow="My pay"
                        heading={`${formatMonthDayRange(weekStart, weekEnd)}, ${weekEnd.getFullYear()}`}
                    />
                </div>
            </main>
        </div>
    );
}

export default PayView;
