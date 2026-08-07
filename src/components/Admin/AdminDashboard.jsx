import React, { Suspense, lazy, useState, useEffect, useCallback } from "react";
import { db } from "../../config/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import DayPayoutPanel from "./DayPayoutPanel";
import { Badge, Button } from "../ui";
import { toDateKey } from "../../utils/dateUtils";
import { attachLedgerPayoutsToSummary, fetchPayoutEntriesForDate } from "../../utils/payoutLedger";

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
    const [dayShiftStatus, setDayShiftStatus] = useState(null);
    const [dayLoading, setDayLoading] = useState(false);
    const [navCollapsed, setNavCollapsed] = useState(true);

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
        setDayShiftStatus(null);
        try {
            const [shiftDoc, payoutEntries] = await Promise.all([
                getDoc(doc(db, "shifts", date)),
                fetchPayoutEntriesForDate(db, date),
            ]);
            if (shiftDoc.exists()) {
                const d = shiftDoc.data();
                setDaySummary(attachLedgerPayoutsToSummary(d.summary || null, payoutEntries));
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

    const changeDate = (delta) => {
        const d = new Date(selectedDate + "T12:00:00");
        d.setDate(d.getDate() + delta);
        setSelectedDate(toDateKey(d));
    };

    const handleEditorClose = () => {
        setActiveTab("shifts");
        fetchDayPayouts(selectedDate);
    };

    const setActiveTabWithData = useCallback((tab) => {
        setActiveTab(tab);
        if (tab === "editor" || tab === "users") {
            loadEmployeesIfNeeded();
        }
    }, [loadEmployeesIfNeeded]);

    const handleNavItemClick = useCallback((tab) => {
        setActiveTabWithData(tab);
        if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
            setNavCollapsed(true);
        }
    }, [setActiveTabWithData]);

    // The sidebar treats "editor" as still belonging to the Shifts section.
    const sidebarValue = activeTab === "editor" ? "shifts" : activeTab;

    const headerForTab = () => {
        if (activeTab === "shifts") {
            return {
                eyebrow: "Shifts",
                title: "Shift Distribution",
                subtitle: null,
                actions: (
                    <div className="flex items-center gap-2 max-[560px]:w-full">
                        <button
                            type="button"
                            onClick={() => changeDate(-1)}
                            title="Previous day"
                            aria-label="Previous day"
                            className="h-10 w-10 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        </button>
                        <input
                            type="date"
                            value={selectedDate}
                            aria-label="Select shift date"
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="h-10 px-3 text-sm font-mono tabular-nums bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] rounded-[var(--radius-sm)] hover:border-[var(--color-line-strong)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/15 transition-colors max-[560px]:min-w-0 max-[560px]:flex-1"
                        />
                        <button
                            type="button"
                            onClick={() => changeDate(1)}
                            title="Next day"
                            aria-label="Next day"
                            className="h-10 w-10 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                        <Button onClick={() => setActiveTabWithData("editor")}>
                            Edit Shift
                        </Button>
                    </div>
                ),
            };
        }
        if (activeTab === "editor") {
            return {
                eyebrow: `Editing ${selectedDate}`,
                title: "Shift Editor",
                subtitle: null,
                actions: (
                    <Button onClick={handleEditorClose} variant="secondary" size="sm">
                        ← Back to Shifts
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
                    <span className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                        Tip Tracker
                    </span>
                    <Badge tone="accent">Admin</Badge>
                </div>
                <div className="flex items-center gap-3">
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
                            "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 border-b border-[var(--color-line)] " +
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
                            <DayPayoutPanel
                                date={selectedDate}
                                summary={daySummary}
                                status={dayShiftStatus}
                                loading={dayLoading}
                            />
                        ) : activeTab === "editor" ? (
                            !employeesLoaded && employeesLoading ? (
                                <PanelLoading label="Loading employees..." />
                            ) : !employeesLoaded && employeesLoadError ? (
                                <PanelLoading label={employeesLoadError} />
                            ) : (
                                <Suspense fallback={<PanelLoading label="Loading shift editor..." />}>
                                    <ShiftEditorPanel
                                        date={selectedDate}
                                        allEmployees={allEmployees.filter(emp => emp.status === "active" && emp.role !== "admin")}
                                        onClose={handleEditorClose}
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
