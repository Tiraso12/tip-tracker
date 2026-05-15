import React, { useState, useEffect, useCallback } from "react";
import styles from "./AdminDashboard.module.css";
import { db } from "../../config/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import TeamManagement from "./TeamManagement";
import DayPayoutPanel from "./DayPayoutPanel";
import ShiftEditorPanel from "./ShiftEditorPanel";
import AdminReportsPanel from "./AdminReportsPanel";
// ─── Main Component ──────────────────────────────────────────────────────────
function AdminDashboard() {
    const { logout } = useAuth();
    const [allEmployees, setAllEmployees] = useState([]);

    // Selected date for viewing/editing a shift
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);

    // Tab switching (Shifts or Users)
    const [activeTab, setActiveTab] = useState("shifts"); // "shifts" | "users" | "editor" | "reports"

    const [daySummary, setDaySummary] = useState(null);
    const [dayLoading, setDayLoading] = useState(false);

    // Fetch all employees
    const fetchEmployees = useCallback(async () => {
        try {
            const snapshot = await getDocs(collection(db, "users"));
            setAllEmployees(snapshot.docs.map((d) => ({ uid: d.id, ...d.data() })));
        } catch (e) {
            console.error("Failed to fetch employees:", e);
        }
    }, []);

    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    // Fetch shift payouts whenever selectedDate changes
    const fetchDayPayouts = useCallback(async (date) => {
        setDayLoading(true);
        setDaySummary(null);
        try {
            const shiftDoc = await getDoc(doc(db, "shifts", date));
            if (shiftDoc.exists()) {
                const d = shiftDoc.data();
                setDaySummary(d.summary || null);
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

    // Prev / next day navigation
    const changeDate = (delta) => {
        const d = new Date(selectedDate + "T12:00:00");
        d.setDate(d.getDate() + delta);
        setSelectedDate(d.toISOString().split("T")[0]);
    };

    // Re-fetch after editor closes (shift may have been saved)
    const handleEditorClose = () => {
        setActiveTab("shifts");
        fetchDayPayouts(selectedDate);
    };

    return (
        <main className={styles.dashboard}>
            {/* Top bar */}
            <div className={styles.topBar}>
                <div className={styles.topBarLeft}>
                    <h1 className={styles.appTitle}>TipTracker</h1>
                    <span className={styles.adminBadge}>Admin</span>
                </div>
                <button className={styles.logoutBtn} onClick={logout}>Log Out</button>
            </div>

            {/* Main content */}
            <div className={styles.mainContent}>
                {/* Left: controls */}
                <div className={styles.controlPanel}>
                    {/* View Toggle */}
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.toggleBtn} ${activeTab === "shifts" ? styles.active : ""}`}
                            onClick={() => setActiveTab("shifts")}
                        >
                            Shifts
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${activeTab === "users" ? styles.active : ""}`}
                            onClick={() => setActiveTab("users")}
                        >
                            Team
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${activeTab === "reports" ? styles.active : ""}`}
                            onClick={() => setActiveTab("reports")}
                        >
                            Reports
                        </button>
                    </div>

                    {activeTab === "shifts" ? (
                        <>
                            <h2 className={styles.panelTitle}>Shift Distribution</h2>
                            <p className={styles.panelSubtitle}>Select a date to view, input, or edit tip distribution for that shift.</p>
                            <div className={styles.dateRow}>
                                <button className={styles.dayNavBtn} onClick={() => changeDate(-1)} title="Previous day">←</button>
                                <input
                                    type="date"
                                    className={styles.dateInput}
                                    value={selectedDate}
                                    aria-label="Select Shift Date"
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                                <button className={styles.dayNavBtn} onClick={() => changeDate(1)} title="Next day">→</button>
                            </div>
                            <button className={styles.openBtn} onClick={() => setActiveTab("editor")}>
                                Edit Shift →
                            </button>
                        </>
                    ) : activeTab === "editor" ? (
                        <>
                            <h2 className={styles.panelTitle}>Shift Editor</h2>
                            <p className={styles.panelSubtitle}>Input tips and adjust team composition for <span className={styles.span}>{selectedDate}</span></p>
                            <button className={styles.openBtn} style={{ marginTop: '1rem', background: 'var(--bg-tertiary)', color: 'var(--text-main)' }} onClick={handleEditorClose}>
                                ← Back to Shifts
                            </button>
                        </>
                    ) : activeTab === "users" ? (
                        <>
                            <h2 className={styles.panelTitle}>Team Management</h2>
                            <p className={styles.panelSubtitle}>Approve new users, assign roles, and manage active employees.</p>
                        </>
                    ) : (
                        <>
                            <h2 className={styles.panelTitle}>Admin Reports</h2>
                            <p className={styles.panelSubtitle}>Generate and export Weekly or Monthly shift summary reports.</p>
                        </>
                    )}
                </div>

                {activeTab === "shifts" ? (
                    <DayPayoutPanel
                        date={selectedDate}
                        summary={daySummary}
                        loading={dayLoading}
                    />
                ) : activeTab === "editor" ? (
                    <ShiftEditorPanel
                        date={selectedDate}
                        allEmployees={allEmployees.filter(emp => emp.status === "active" && emp.role !== "admin")}
                        onClose={handleEditorClose}
                    />
                ) : activeTab === "users" ? (
                    <TeamManagement allEmployees={allEmployees} refreshEmployees={fetchEmployees} />
                ) : (
                    <AdminReportsPanel />
                )}
            </div>
        </main>
    );
}

export default AdminDashboard;
