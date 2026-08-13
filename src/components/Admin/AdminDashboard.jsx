import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { db } from "../../config/firebase";
import { collection, getDocs, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { canApproveAccounts, canRemoveSettledDay, tierLabel } from "../../utils/permissions";
import DayRailLanding from "./DayRailLanding";
import BarDatePill from "./BarDatePill";
import AppBar from "../AppBar/AppBar";
import { TopProgressBar } from "../ui";
import { PendingActionsContext, usePendingActionsState } from "../../context/PendingActionsContext";
import { toDateKey } from "../../utils/dateUtils";
import { getLandingStage, ORPHANED_PAYOUTS_STATUS } from "../../utils/dayFlow";
import { attachLedgerPayoutsToSummary, fetchPayoutEntriesForDate } from "../../utils/payoutLedger";
import { removeShiftAtomically } from "../../utils/closeoutPersistence";

const TeamManagement = lazy(() => import("./TeamManagement"));
const ShiftEditorPanel = lazy(() => import("./ShiftEditorPanel"));

// The workspace sidebar is DESKTOP-ONLY. A phone gets no top-level nav: the top
// level has exactly one real destination (Shifts, which is the app), so a menu
// choosing between it and Team was 90px of banded chrome - 24% of a 390x844
// screen - to reveal two items, one of which was always the screen you were on.
// Team now hangs off the account sheet at every width, and the Day Rail is the
// only navigation on a phone. If a second real destination ever lands (Settings,
// Payroll, Reports returning), that call gets re-made - do not pre-build for it.
const NAV_ITEMS = [
    {
        value: "shifts",
        label: "Shifts",
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
        ),
    },
    {
        value: "users",
        label: "Team",
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        ),
    },
];

function MenuIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
    );
}

function SideNavItem({ item, active, onClick, collapsed }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={
                // Desktop-only rows: the pointer here is a mouse, not a thumb, so
                // the denser sidebar height is fine. The 44px thumb-target rule
                // applies to the app bar and the Day Rail, which a phone still has.
                "group relative w-full flex items-center gap-3 px-3 py-2 text-sm rounded-[var(--radius-sm)] " +
                "transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                (collapsed ? "justify-center px-0 h-10 " : "") +
                (active
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]")
            }
        >
            <span className={active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink-soft)]"}>
                {item.icon}
            </span>
            <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
        </button>
    );
}

function PanelLoading({ label = "Loading..." }) {
    return (
        <div className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
            {label}
        </div>
    );
}

// `onGoToMyPay` is set for anyone who is ALSO paid out of the pool - a captain.
// It is what makes the workspace one of their two places rather than the only
// one, and its presence is what moves the bar's home control: see handleHomeClick.
function AdminDashboard({ onGoToMyPay }) {
    const { user } = useAuth();
    const [allEmployees, setAllEmployees] = useState([]);
    const [employeesLoaded, setEmployeesLoaded] = useState(false);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employeesLoadError, setEmployeesLoadError] = useState("");
    const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
    const [activeTab, setActiveTab] = useState("shifts"); // "shifts" | "users" | "editor"
    const [daySummary, setDaySummary] = useState(null);
    const [dayLineup, setDayLineup] = useState(null);
    const [dayShiftStatus, setDayShiftStatus] = useState(null);
    // Ledger entries for a date whose shift doc is gone. Only ever non-empty in
    // the orphaned-payouts stage; it is what the landing lists as "this is the
    // payroll data removing this would delete".
    const [dayOrphanedEntries, setDayOrphanedEntries] = useState([]);
    const [dayDataDate, setDayDataDate] = useState(null);
    const [dayLoading, setDayLoading] = useState(false);
    const dayFetchIdRef = useRef(0);
    // Desktop sidebar only: rail-width (icons) vs full-width (icons + labels).
    const [navCollapsed, setNavCollapsed] = useState(true);
    const [removingShift, setRemovingShift] = useState(false);
    // Which day-step the shift editor opens on when entered from a landing CTA.
    const [editorStep, setEditorStep] = useState("floor");
    // Set only by a completed Confirm & Save, so the confirmation lands on the day
    // it belongs to instead of on the editor the admin is leaving.
    const [shiftSaved, setShiftSaved] = useState(false);

    // People waiting on a decision, shown on the app bar's account avatar.
    // Gated on the SAME predicate that guards the Approve/Deny controls, not on a
    // role read here - the badge must never advertise work its viewer cannot do,
    // and when the capability moves it moves in one place.
    const canApprove = canApproveAccounts(user);
    const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

    // Team is the manager's screen - approvals, job titles, deactivation, the
    // temp-staff merge - so a captain is never shown the door to it. Removing a
    // settled day destroys the payout ledger and is manager-only for the same
    // reason; correcting one is captain work and stays reachable to them.
    // Both are refused server-side too; hiding them is so a captain is never
    // offered a control that would come back PERMISSION_DENIED.
    const canReachTeam = canApprove;
    const canRemoveDay = canRemoveSettledDay(user);
    const workspaceTier = tierLabel(user);

    // Live, because approving or denying someone has to take them off the count
    // immediately - including from the Team screen sitting under the same bar.
    // Scoped query, not the full roster: this runs for the whole session.
    useEffect(() => {
        if (!canApprove) {
            setPendingApprovalCount(0);
            return undefined;
        }
        return onSnapshot(
            query(collection(db, "users"), where("status", "==", "pending")),
            (snapshot) => setPendingApprovalCount(snapshot.size),
            (e) => {
                // A count nobody can read is not worth a broken bar: fail to no badge.
                console.error("Failed to watch pending approvals:", e);
                setPendingApprovalCount(0);
            }
        );
    }, [canApprove]);

    // One progress cue for the whole workspace, driven by every slow action that
    // registers through the provider below.
    const pendingActions = usePendingActionsState();
    const { beginPendingAction, isPending } = pendingActions;

    const loadEmployeesIfNeeded = useCallback(async ({ force = false } = {}) => {
        if (employeesLoaded && !force) return;

        setEmployeesLoading(true);
        setEmployeesLoadError("");
        try {
            const snapshot = await getDocs(collection(db, "users"));
            setAllEmployees(snapshot.docs.map((d) => ({ uid: d.id, ...d.data() })));
            setEmployeesLoaded(true);
        } catch (e) {
            console.error("Failed to fetch employees:", e);
            setEmployeesLoadError("Employee data could not be loaded. Try opening this section again.");
        } finally {
            setEmployeesLoading(false);
        }
    }, [employeesLoaded]);

    // The day is no longer blanked before a refetch: a refetch of the date already
    // on screen (after a save, after backing out of the editor) holds its content
    // while the progress bar carries the wait. `dayDataDate` is what keeps that
    // honest - the landing is only handed data for the date it was loaded for, so
    // a date change shows a load and never the previous day's money.
    const fetchDayPayouts = useCallback(async (date) => {
        const fetchId = ++dayFetchIdRef.current;
        const endPendingAction = beginPendingAction();
        setDayLoading(true);
        try {
            const [shiftDoc, payoutEntries] = await Promise.all([
                getDoc(doc(db, "shifts", date)),
                fetchPayoutEntriesForDate(db, date),
            ]);
            if (fetchId !== dayFetchIdRef.current) return;
            if (shiftDoc.exists()) {
                const d = shiftDoc.data();
                setDaySummary(attachLedgerPayoutsToSummary(d.summary || null, payoutEntries));
                // Lift the saved floor plan (already returned here) so the setup
                // landing can confirm the lineup team-by-team without another fetch.
                setDayLineup({
                    teams: Array.isArray(d.teams) ? d.teams : [],
                    barTeam: d.barTeam || { members: [] },
                    runners: Array.isArray(d.runners) ? d.runners : [],
                });
                setDayShiftStatus(d.status || (d.summary || d.firstClosedAt || payoutEntries.length > 0 || d.payouts ? "closed" : "setup"));
                setDayOrphanedEntries([]);
            } else {
                // The date has no shift (or Remove just deleted it): held-over
                // content must not stand.
                setDaySummary(null);
                setDayLineup(null);
                // Payout entries with no shift doc behind them are real payroll
                // data - the ledger migration and unfinished writes both leave
                // this shape. Without a status the landing showed the blank
                // "set up the floor" day, so those entries could not be reached,
                // let alone removed. A truly empty date (no entries either) keeps
                // the null status and the untouched blank-day landing.
                setDayShiftStatus(payoutEntries.length > 0 ? ORPHANED_PAYOUTS_STATUS : null);
                setDayOrphanedEntries(payoutEntries.length > 0 ? payoutEntries : []);
            }
        } catch (e) {
            console.error("Failed to fetch day payouts:", e);
            if (fetchId !== dayFetchIdRef.current) return;
            setDaySummary(null);
            setDayLineup(null);
            setDayShiftStatus(null);
            setDayOrphanedEntries([]);
        } finally {
            // A superseded fetch leaves the newer one's state alone.
            if (fetchId === dayFetchIdRef.current) {
                setDayDataDate(date);
                setDayLoading(false);
            }
            endPendingAction();
        }
    }, [beginPendingAction]);

    useEffect(() => {
        setShiftSaved(false);
        fetchDayPayouts(selectedDate);
    }, [selectedDate, fetchDayPayouts]);

    useEffect(() => {
        if (!shiftSaved) return undefined;
        const timeoutId = window.setTimeout(() => setShiftSaved(false), 6000);
        return () => window.clearTimeout(timeoutId);
    }, [shiftSaved]);

    // Every screen change starts at the top. The editor is a long scrolling form,
    // so without this the landing arrives scrolled past its own rail and the saved
    // confirmation. A programmatic scroll only ever reveals the floating actions
    // (see FloatingActions), never hides them.
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
    }, [activeTab]);

    // Called by the editor on every exit - Cancel, floor Done, and a completed
    // Confirm & Save - so only an explicit `saved` flag may claim a save happened.
    const handleEditorClose = (options) => {
        setActiveTab("shifts");
        setShiftSaved(options?.saved === true);
        fetchDayPayouts(selectedDate);
    };

    // Hard-delete a settled shift for the selected date. This permanently removes
    // the shift and everyone's payouts for that date from all dashboards (the
    // employee cards clear live because they subscribe to the ledger), and cannot
    // be undone. To fix a wrong-date settlement, the admin removes it here and
    // re-enters the shift on the correct date through the normal flow.
    const handleRemoveShift = useCallback(async () => {
        if (removingShift) return;

        const [y, m, d] = selectedDate.split("-");
        const friendlyDate = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
        });
        const confirmed = window.confirm(
            `Remove the shift for ${friendlyDate}?\n\n` +
            "This permanently deletes the shift and everyone's payouts for that date " +
            "from all dashboards. Each employee on this shift will no longer see this " +
            "date's payout. This cannot be undone.\n\n" +
            "To move a shift to a different date, remove it here and re-enter it on the correct date."
        );
        if (!confirmed) return;

        setRemovingShift(true);
        // Covers the delete itself; the refetch it hands over to registers its own,
        // so the bar stays up across both.
        const endPendingAction = beginPendingAction();
        try {
            await removeShiftAtomically({
                db,
                date: selectedDate,
                updatedBy: user?.uid || null,
            });
            await fetchDayPayouts(selectedDate);
        } catch (e) {
            console.error("Failed to remove shift:", e);
            alert("Could not remove the shift. Please try again.");
        } finally {
            setRemovingShift(false);
            endPendingAction();
        }
    }, [removingShift, selectedDate, user, fetchDayPayouts, beginPendingAction]);

    const setActiveTabWithData = useCallback((tab) => {
        setActiveTab(tab);
        if (tab === "editor" || tab === "users") {
            loadEmployeesIfNeeded();
        }
    }, [loadEmployeesIfNeeded]);

    // Enter the day flow (the shift editor) focused on a specific step. The Day
    // Rail landing CTAs route through here.
    const enterEditor = useCallback((initialStep = "floor") => {
        setEditorStep(["settle", "review"].includes(initialStep) ? initialStep : "floor");
        setActiveTabWithData("editor");
    }, [setActiveTabWithData]);

    // Leaving the shift editor by a control that lives outside it (the workspace menu,
    // the home button) has to clear the SAME unsaved-work confirmation the editor's own
    // Cancel does. The editor registers its guard here while it is mounted; without it
    // these paths walked past the check and threw away money edits on a closed shift
    // with no prompt at all.
    const editorLeaveGuardRef = useRef(null);
    const registerEditorLeaveGuard = useCallback((guard) => {
        editorLeaveGuardRef.current = guard;
    }, []);

    // True when it is safe to navigate away right now.
    const confirmLeaveEditor = useCallback(() => {
        const guard = editorLeaveGuardRef.current;
        return guard ? guard() : true;
    }, []);

    // The one way into a top-level tab, shared by the desktop sidebar and the
    // account sheet's Team item so both clear the editor's leave guard.
    const handleNavItemClick = useCallback((tab) => {
        if (!confirmLeaveEditor()) return;
        // Same re-read handleEditorClose does: a setup shift autosaves while editing,
        // so the landing would otherwise show the day as it was before the edit.
        const needsRefresh = activeTab === "editor" && tab === "shifts";
        setActiveTabWithData(tab);
        if (needsRefresh) fetchDayPayouts(selectedDate);
    }, [confirmLeaveEditor, activeTab, selectedDate, setActiveTabWithData, fetchDayPayouts]);

    // Today's Shifts landing, from anywhere, in one tap. TODAY, not the day that
    // happened to be selected - whoever reaches for it mid-shift wants the shift
    // they are working, so a day browsed to earlier is not sticky. Routed through
    // the same leave guard as everything else that exits the editor.
    const goToTodayShifts = useCallback(() => {
        if (!confirmLeaveEditor()) return;
        const today = toDateKey(new Date());
        // A setup shift autosaves while editing, so the landing has to re-read the day.
        // Changing the date already refetches through the selectedDate effect; only the
        // same-day case needs an explicit refresh.
        const needsRefresh = activeTab === "editor" && today === selectedDate;
        setSelectedDate(today);
        setActiveTabWithData("shifts");
        if (needsRefresh) fetchDayPayouts(today);
    }, [confirmLeaveEditor, activeTab, selectedDate, setActiveTabWithData, fetchDayPayouts]);

    // HOME MEANS THE VIEWER'S OWN HOME, and the two tiers here do not share one.
    // The manager runs the restaurant and is not paid from the pool, so home is
    // today's shifts, exactly as it always was. A captain IS paid from the pool,
    // so home is their own pay - that is the trade the captain chose knowingly:
    // tonight's shift costs a tap (the account sheet's Shifts item, below) to buy
    // their own week being where they land. Same leave guard either way.
    const handleHomeClick = useCallback(() => {
        if (!onGoToMyPay) return goToTodayShifts();
        if (!confirmLeaveEditor()) return;
        onGoToMyPay();
    }, [onGoToMyPay, goToTodayShifts, confirmLeaveEditor]);

    // The sidebar treats "editor" as still belonging to the Shifts section.
    const sidebarValue = activeTab === "editor" ? "shifts" : activeTab;

    // Team in the account sheet. This is the ONLY door to it on a phone, and it is
    // present at every width so the destination lives in one predictable place
    // rather than moving between a sidebar and a menu as the viewport changes.
    //
    // Shifts joins it for whoever's home is NOT Shifts - a captain, whose home
    // control goes to their own pay. The rule is one line: a destination is
    // listed here exactly when the bar's home control does not already lead
    // there. For the manager, home IS Shifts, so listing it would be noise.
    const accountItems = [
        ...(onGoToMyPay ? [{
            key: "shifts",
            label: NAV_ITEMS[0].label,
            icon: NAV_ITEMS[0].icon,
            active: sidebarValue === "shifts",
            onClick: goToTodayShifts,
        }] : []),
        ...NAV_ITEMS
            .filter((item) => item.value === "users" && canReachTeam)
            .map((item) => ({
                key: item.value,
                label: item.label,
                icon: item.icon,
                active: sidebarValue === item.value,
                // Team is where a pending sign-up is acted on, so the avatar's count
                // repeats here - the tap from the badge lands on the number's screen.
                count: pendingApprovalCount,
                onClick: () => handleNavItemClick(item.value),
            })),
    ];

    // Who can be put on a section tonight. The manager is excluded BY IDENTITY,
    // not by job title: they oversee the operation, never work a section, and
    // take no share of the pool. Their title is not what keeps them out - today
    // it happens to be "admin", which the legacy filter beside this catches, but
    // the pointer is what actually names them and it survives that value being
    // retired. Assigning them would also pay them zero silently, since
    // ROLE_POINTS knows no weight for a manager.
    const floorPlanPool = useMemo(
        () => allEmployees.filter((emp) =>
            emp.status === "active" && emp.role !== "admin" && emp.uid !== user?.managerUid
        ),
        [allEmployees, user?.managerUid]
    );

    // Day data is only shown for the date it was loaded for.
    const dayDataIsCurrent = dayDataDate === selectedDate;

    // The desktop <h1> mirrors where the day actually is, instead of always
    // reading "Pay out" (which contradicted a fresh/setup day). The date now
    // lives once in the app-bar Bar Date pill, so there is no date band here.
    const SHIFTS_STAGE_TITLE = {
        "build-floor": "Set up the floor",
        settle: "Confirm the floor",
        closed: "Pay out",
        "orphaned-payouts": "Leftover payouts",
    };

    const headerForTab = () => {
        if (activeTab === "shifts") {
            return {
                eyebrow: "Shifts",
                title: SHIFTS_STAGE_TITLE[getLandingStage(dayShiftStatus)] || "Shifts",
                subtitle: null,
                actions: null,
            };
        }
        if (activeTab === "editor") {
            // The Day Rail names the active step, so the editor needs no eyebrow,
            // step labels, or Back action here - the workspace nav handles exit.
            return {
                eyebrow: null,
                title: "Edit shift",
                subtitle: null,
                actions: null,
            };
        }
        return {
            eyebrow: "Team",
            title: "Team Management",
            subtitle: "Approve new users, assign roles, and manage active employees.",
        };
    };

    const header = headerForTab();

    return (
        <PendingActionsContext.Provider value={pendingActions}>
        <div className="min-h-screen bg-[var(--color-bg)]">
            {/* Above the z-40 app bar: the one cue that must stay visible while a
                write is in flight, including while the floating actions are away. */}
            <TopProgressBar active={isPending} label="Saving and loading shift data" />

            {/* The top app bar, shared with the pay side - see components/AppBar.
                The day lives in it on both day screens. On Shifts it is the control
                that changes the day; in the editor it is a label, because the day
                being typed against must be readable there and must not be swappable
                mid-edit. Team has no day. */}
            <AppBar
                onHome={handleHomeClick}
                homeLabel={onGoToMyPay ? "Go to my pay" : "Go to today's shifts"}
                homeTitle={onGoToMyPay ? "My pay" : "Today's shifts"}
                tier={workspaceTier}
                dateControl={
                    activeTab === "shifts" || activeTab === "editor" ? (
                        <BarDatePill
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                            readOnly={activeTab === "editor"}
                        />
                    ) : null
                }
                accountItems={accountItems}
                pendingApprovalCount={pendingApprovalCount}
            />

            <div className="flex flex-col lg:flex-row min-h-[calc(100vh-3.5rem)]">
                {/* Workspace sidebar - desktop only, and unchanged from what it has
                    always been there. It used to double as the phone's top-level
                    menu, folded down into a horizontal band behind a hamburger; that
                    band is gone and this markup no longer carries any phone case. */}
                <aside
                    id="admin-workspace-nav"
                    className={
                        "hidden lg:block lg:shrink-0 lg:border-r border-[var(--color-line)] bg-[var(--color-bg)] transition-[width] duration-200 " +
                        (navCollapsed ? "lg:w-16" : "lg:w-60")
                    }
                >
                    <nav className="lg:sticky lg:top-14 p-3 lg:py-4">
                        <div className={"flex mb-3 " + (navCollapsed ? "justify-center" : "px-1 justify-between items-center")}>
                            {!navCollapsed ? (
                                <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                    Workspace
                                </p>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => setNavCollapsed(prev => !prev)}
                                aria-expanded={!navCollapsed}
                                aria-controls="admin-workspace-nav"
                                aria-label={navCollapsed ? "Expand workspace navigation" : "Collapse workspace navigation"}
                                title={navCollapsed ? "Expand workspace" : "Collapse workspace"}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                            >
                                <MenuIcon />
                            </button>
                        </div>
                        <div className="flex flex-col gap-1">
                            {NAV_ITEMS.filter((item) => item.value !== "users" || canReachTeam).map((item) => (
                                <SideNavItem
                                    key={item.value}
                                    item={item}
                                    active={sidebarValue === item.value}
                                    onClick={() => handleNavItemClick(item.value)}
                                    collapsed={navCollapsed}
                                />
                            ))}
                        </div>
                    </nav>
                </aside>

                {/* Main content */}
                <main className="flex-1 min-w-0 px-4 sm:px-8 py-5 lg:py-10">
                    <div className="max-w-6xl mx-auto">
                        <header className={
                            // On mobile Shifts and the editor the content header is
                            // hidden - the Day Rail names the step and sits flush under
                            // the app bar. Desktop keeps the page title for coherence.
                            (activeTab === "shifts" || activeTab === "editor" ? "hidden sm:flex " : "flex ") +
                            "flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 border-b border-[var(--color-line)] " +
                            (activeTab === "editor" || activeTab === "shifts" ? "pb-3 mb-3 sm:pb-6 sm:mb-6" : "pb-4 sm:pb-6 mb-4 sm:mb-6")
                        }>
                            <div className={
                                "flex flex-col gap-1.5 " +
                                (activeTab === "shifts" ? "hidden sm:flex" : "")
                            }>
                                {header.eyebrow ? (
                                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                        {header.eyebrow}
                                    </span>
                                ) : null}
                                <h1 className={
                                    "font-display text-2xl sm:text-4xl font-medium tracking-tight text-[var(--color-ink)] " +
                                    (activeTab === "editor" ? "hidden sm:block" : "")
                                }>
                                    {header.title}
                                </h1>
                                {header.subtitle ? (
                                    <p className="text-sm text-[var(--color-ink-soft)] max-w-2xl">
                                        {header.subtitle}
                                    </p>
                                ) : null}
                            </div>
                            {header.actions ? (
                                <div className="flex items-center gap-2 shrink-0">{header.actions}</div>
                            ) : null}
                        </header>

                        {activeTab === "shifts" ? (
                            <DayRailLanding
                                date={selectedDate}
                                summary={dayDataIsCurrent ? daySummary : null}
                                lineup={dayDataIsCurrent ? dayLineup : null}
                                status={dayDataIsCurrent ? dayShiftStatus : null}
                                orphanedEntries={dayDataIsCurrent ? dayOrphanedEntries : []}
                                loading={dayLoading || !dayDataIsCurrent}
                                savedNotice={shiftSaved}
                                onBuildFloor={() => enterEditor("floor")}
                                onContinueSettle={() => enterEditor("settle")}
                                onOpenReview={() => enterEditor("review")}
                                onEditFloor={() => enterEditor("floor")}
                                onRemoveShift={canRemoveDay ? handleRemoveShift : undefined}
                                removingShift={removingShift}
                            />
                        ) : activeTab === "editor" ? (
                            !employeesLoaded && employeesLoading ? (
                                <PanelLoading label="Loading employees..." />
                            ) : !employeesLoaded && employeesLoadError ? (
                                <PanelLoading label={employeesLoadError} />
                            ) : (
                                <Suspense fallback={<PanelLoading label="Loading shift…" />}>
                                    <ShiftEditorPanel
                                        date={selectedDate}
                                        allEmployees={floorPlanPool}
                                        onClose={handleEditorClose}
                                        initialStep={editorStep}
                                        onRegisterLeaveGuard={registerEditorLeaveGuard}
                                    />
                                </Suspense>
                            )
                        ) : !employeesLoaded && employeesLoading ? (
                            <PanelLoading label="Loading team..." />
                        ) : !employeesLoaded && employeesLoadError ? (
                            <PanelLoading label={employeesLoadError} />
                        ) : (
                            <Suspense fallback={<PanelLoading label="Loading team management..." />}>
                                <TeamManagement
                                    allEmployees={allEmployees}
                                    refreshEmployees={() => loadEmployeesIfNeeded({ force: true })}
                                />
                            </Suspense>
                        )}
                    </div>
                </main>
            </div>
        </div>
        </PendingActionsContext.Provider>
    );
}

export default AdminDashboard;
