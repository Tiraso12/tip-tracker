import React, { Suspense, lazy, useState, useEffect, useCallback } from "react";
import { db } from "../../config/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import DayPayoutPanel from "./DayPayoutPanel";
import DayRailLanding from "./DayRailLanding";
import BarDatePill from "./BarDatePill";
import { Badge, Button } from "../ui";
import { toDateKey } from "../../utils/dateUtils";
import { getLandingStage } from "../../utils/dayFlow";
import { attachLedgerPayoutsToSummary, fetchPayoutEntriesForDate } from "../../utils/payoutLedger";
import { removeShiftAtomically } from "../../utils/closeoutPersistence";

const TeamManagement = lazy(() => import("./TeamManagement"));
const ShiftEditorPanel = lazy(() => import("./ShiftEditorPanel"));
const AdminReportsPanel = lazy(() => import("./AdminReportsPanel"));

const SHOW_ADMIN_REPORTS = false;

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
    SHOW_ADMIN_REPORTS ? {
        value: "reports",
        label: "Reports",
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
        ),
    } : null,
].filter(Boolean);

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
                "group relative w-full flex items-center gap-3 px-3 py-2 text-sm rounded-[var(--radius-sm)] " +
                "transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 " +
                (collapsed ? "lg:justify-center lg:px-0 lg:h-10 " : "") +
                (active
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]")
            }
        >
            <span className={active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink-soft)]"}>
                {item.icon}
            </span>
            <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
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

function AdminDashboard() {
    const { logout, user } = useAuth();
    const [allEmployees, setAllEmployees] = useState([]);
    const [employeesLoaded, setEmployeesLoaded] = useState(false);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employeesLoadError, setEmployeesLoadError] = useState("");
    const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
    const [activeTab, setActiveTab] = useState("shifts"); // "shifts" | "users" | "editor" | "reports"
    const [daySummary, setDaySummary] = useState(null);
    const [dayLineup, setDayLineup] = useState(null);
    const [dayShiftStatus, setDayShiftStatus] = useState(null);
    const [dayLoading, setDayLoading] = useState(false);
    const [navCollapsed, setNavCollapsed] = useState(true);
    const [removingShift, setRemovingShift] = useState(false);
    // Which day-step the shift editor opens on when entered from a landing CTA.
    const [editorStep, setEditorStep] = useState("floor");

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

    const fetchDayPayouts = useCallback(async (date) => {
        setDayLoading(true);
        setDaySummary(null);
        setDayLineup(null);
        setDayShiftStatus(null);
        try {
            const [shiftDoc, payoutEntries] = await Promise.all([
                getDoc(doc(db, "shifts", date)),
                fetchPayoutEntriesForDate(db, date),
            ]);
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
            }
        } catch (e) {
            console.error("Failed to fetch day payouts:", e);
        } finally {
            setDayLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDayPayouts(selectedDate);
    }, [selectedDate, fetchDayPayouts]);

    useEffect(() => {
        if (!SHOW_ADMIN_REPORTS && activeTab === "reports") {
            setActiveTab("shifts");
        }
    }, [activeTab]);

    const handleEditorClose = () => {
        setActiveTab("shifts");
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
        }
    }, [removingShift, selectedDate, user, fetchDayPayouts]);

    const setActiveTabWithData = useCallback((tab) => {
        setActiveTab(tab);
        if (tab === "editor" || tab === "users") {
            loadEmployeesIfNeeded();
        }
    }, [loadEmployeesIfNeeded]);

    // Enter the day flow (the shift editor) focused on a specific step. The Day
    // Rail landing CTAs route through here.
    const enterEditor = useCallback((initialStep = "floor") => {
        setEditorStep(initialStep === "settle" ? "settle" : "floor");
        setActiveTabWithData("editor");
    }, [setActiveTabWithData]);

    const handleNavItemClick = useCallback((tab) => {
        setActiveTabWithData(tab);
        if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
            setNavCollapsed(true);
        }
    }, [setActiveTabWithData]);

    // The sidebar treats "editor" as still belonging to the Shifts section.
    const sidebarValue = activeTab === "editor" ? "shifts" : activeTab;

    // The desktop <h1> mirrors where the day actually is, instead of always
    // reading "Pay out" (which contradicted a fresh/setup day). The date now
    // lives once in the app-bar Bar Date pill, so there is no date band here.
    const SHIFTS_STAGE_TITLE = {
        "build-floor": "Set up the floor",
        settle: "Confirm the floor",
        closed: "Pay out",
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
            return {
                eyebrow: "Shift",
                title: "Edit shift",
                subtitle: null,
                actions: (
                    <Button onClick={handleEditorClose} variant="secondary" size="sm">
                        ← Back
                    </Button>
                ),
            };
        }
        if (activeTab === "users") {
            return {
                eyebrow: "Team",
                title: "Team Management",
                subtitle: "Approve new users, assign roles, and manage active employees.",
            };
        }
        return {
            eyebrow: "Reports",
            title: "Admin Reports",
            subtitle: "Generate and export weekly, monthly, or pay-period shift summaries.",
        };
    };

    const header = headerForTab();

    return (
        <div className="min-h-screen bg-[var(--color-bg)]">
            {/* Top app bar */}
            <header className="sticky top-0 z-20 h-14 px-4 sm:px-6 flex items-center justify-between bg-[var(--color-surface)] border-b border-[var(--color-line)]">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setNavCollapsed(prev => !prev)}
                        aria-expanded={!navCollapsed}
                        aria-controls="admin-workspace-nav"
                        aria-label={navCollapsed ? "Open workspace navigation" : "Collapse workspace navigation"}
                        title={navCollapsed ? "Open workspace" : "Collapse workspace"}
                        className="h-9 w-9 inline-flex lg:hidden items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                    >
                        <MenuIcon />
                    </button>
                    {/* Brand is kept for desktop coherence but dropped on the
                        mobile admin bar - there the Bar Date + Log Out are enough. */}
                    <span className="hidden sm:inline font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                        Tip Tracker
                    </span>
                    <span className="hidden sm:inline">
                        <Badge tone="accent">Admin</Badge>
                    </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                    {activeTab === "shifts" ? (
                        <BarDatePill
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                        />
                    ) : null}
                    {user?.username ? (
                        <span className="hidden sm:inline text-xs text-[var(--color-ink-muted)]">
                            {user.username}
                        </span>
                    ) : null}
                    <Button onClick={logout} variant="secondary" size="sm">
                        Log Out
                    </Button>
                </div>
            </header>

            <div className="flex flex-col lg:flex-row min-h-[calc(100vh-3.5rem)]">
                {/* Sidebar */}
                <aside
                    id="admin-workspace-nav"
                    className={
                        "lg:block lg:shrink-0 lg:border-r border-b lg:border-b-0 border-[var(--color-line)] bg-[var(--color-bg)] transition-[width] duration-200 " +
                        (navCollapsed ? "hidden lg:w-16" : "block lg:w-60")
                    }
                >
                    <nav className="lg:sticky lg:top-14 p-3 lg:py-4">
                        <div className={"hidden lg:flex mb-3 " + (navCollapsed ? "justify-center" : "px-1 justify-between items-center")}>
                            {!navCollapsed ? (
                                <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                    Workspace
                                </p>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => setNavCollapsed(prev => !prev)}
                                aria-expanded={!navCollapsed}
                                aria-label={navCollapsed ? "Open workspace navigation" : "Collapse workspace navigation"}
                                title={navCollapsed ? "Open workspace" : "Collapse workspace"}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                            >
                                <MenuIcon />
                            </button>
                        </div>
                        <p className="lg:hidden px-3 mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                            Workspace
                        </p>
                        <div className="flex lg:flex-col gap-1">
                            {NAV_ITEMS.map((item) => (
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
                            // On mobile Shifts the date now lives in the app-bar pill and
                            // the title is desktop-only, so the whole content header is
                            // hidden there - the Day Rail sits flush under the app bar.
                            (activeTab === "shifts" ? "hidden sm:flex " : "flex ") +
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
                                summary={daySummary}
                                lineup={dayLineup}
                                status={dayShiftStatus}
                                loading={dayLoading}
                                onBuildFloor={() => enterEditor("floor")}
                                onContinueSettle={() => enterEditor("settle")}
                                onEditFloor={() => enterEditor("floor")}
                                onRemoveShift={handleRemoveShift}
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
                                        allEmployees={allEmployees.filter(emp => emp.status === "active" && emp.role !== "admin")}
                                        onClose={handleEditorClose}
                                        initialStep={editorStep}
                                    />
                                </Suspense>
                            )
                        ) : activeTab === "users" ? (
                            !employeesLoaded && employeesLoading ? (
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
                            )
                        ) : (
                            <Suspense fallback={<PanelLoading label="Loading reports..." />}>
                                <AdminReportsPanel />
                            </Suspense>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default AdminDashboard;
