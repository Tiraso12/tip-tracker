import React, { useState, useEffect, useCallback } from "react";
import styles from "./AdminDashboard.module.css";
import { ROLE_POINTS, RUNNER_FLAT_RATE } from "../../utils/constants";
import { calculateShift } from "../../utils/engine";
import { db } from "../../config/firebase";
import { collection, getDocs, doc, setDoc, getDoc, query, where } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import ShiftSetupDnd from "./ShiftSetup/ShiftSetupDnd";
import TeamManagement from "./TeamManagement";
import { generateShiftReport, generateWeeklyReport, generateMonthlyReport } from "../../utils/pdfExport";
import { getCurrentWeek } from "../../utils/dateUtils";

const RESTAURANT_ROLES = ["captain", "server", "back", "assistant"];
const ROLE_LABELS = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: `Runner (flat $${RUNNER_FLAT_RATE})`,
};

const emptyTeamPools = () => ({ sales: "", tips: "", cash: "", gratuity: "", contract26Gratuity: "", runners: "" });
const emptyTeam = (teamId) => ({ teamId, members: [], pools: emptyTeamPools(), contracts: [] });

const ROLE_ORDER = ["captain", "server", "back", "assistant", "bartender", "runner"];

// ─── Main Component ──────────────────────────────────────────────────────────
function AdminDashboard() {
    const { logout } = useAuth();
    const [allEmployees, setAllEmployees] = useState([]);

    // Selected date for viewing/editing a shift
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);

    // Tab switching (Shifts or Users)
    const [activeTab, setActiveTab] = useState("shifts"); // "shifts" | "users" | "editor" | "reports"

    // Day payout panel state
    const [dayPayouts, setDayPayouts] = useState(null);
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
        setDayPayouts(null);
        setDaySummary(null);
        try {
            const shiftDoc = await getDoc(doc(db, "shifts", date));
            if (shiftDoc.exists()) {
                const d = shiftDoc.data();
                setDayPayouts(d.payouts || null);
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
                            Team Mgmt
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
                            <p className={styles.panelSubtitle}>Input cash, credit tips, and adjust team composition for {selectedDate}.</p>
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
                        payouts={dayPayouts}
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

// ─── Day Payout Panel ─────────────────────────────────────────────────────────
function DayPayoutPanel({ date, payouts, summary, loading }) {
    const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

    // Format date nicely for the header
    const displayDate = (() => {
        const [y, m, d] = date.split("-");
        return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
            weekday: "long", year: "numeric", month: "long", day: "numeric"
        });
    })();

    return (
        <div className={styles.payoutPanel}>
            <div className={styles.payoutPanelHeader}>
                <h3 className={styles.payoutPanelTitle}>Day Payouts <span className={styles.payoutPanelDate}>• {displayDate}</span></h3>
                {summary && (
                    <button
                        className={styles.exportBtn}
                        onClick={() => generateShiftReport(date, summary, payouts)}
                    >
                        Export PDF
                    </button>
                )}
            </div>

            {loading ? (
                <div className={styles.payoutEmpty}>Loading...</div>
            ) : !summary ? (
                <div className={styles.payoutEmpty}>
                    <span className={styles.payoutEmptyIcon}>📋</span>
                    <p>No shift saved for this date.</p>
                    <p className={styles.payoutEmptyHint}>Open the shift editor to input and calculate payouts.</p>
                </div>
            ) : (
                <>
                    {/* Shift Audit Summary */}
                    <div className={styles.daySummaryBar} style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>INPUTS</div>
                                <div style={{ fontWeight: 600 }}>Team Sales: {fmt(summary.derivedValues?.totalTeamSales)}</div>
                                <div>Contract Grat: {fmt(summary.derivedValues?.grtContractTotal)}</div>
                                <div>DCTP ({fmt(summary.derivedValues?.baseTeamCTP)}) + BCTP ({fmt(summary.derivedValues?.barCTP)}): {fmt(summary.derivedValues?.ctpTotal)}</div>
                                <div>Cash Total: {fmt(summary.derivedValues?.baseTeamCash)}</div>
                                <div>Grat total: {fmt(summary.derivedValues?.grtTotal)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>ALLOCATIONS (HOUSE & BAR)</div>
                                <div>Door: {fmt((summary.allocations?.doorCTPAllocation || 0) + (summary.allocations?.doorGRTAllocation || 0))}</div>
                                <div>Bar Cut: {fmt((summary.allocations?.barCTPAllocation || 0) + (summary.allocations?.barGRTAllocation || 0))}</div>
                                <div>House: {fmt(summary.allocations?.houseAllocation || 0)}</div>
                                <div>Coordinator: {fmt(summary.allocations?.peCoordinatorGRT || 0)}</div>
                                <div>Runners Fee: {fmt(summary.allocations?.totalRunnerPay || 0)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>BALANCES</div>
                                <div style={{ fontWeight: 600, color: summary.balances?.overallBalance === 0 ? 'var(--success)' : 'var(--danger)' }}>
                                    Overall Balance: {fmt(summary.balances?.overallBalance)}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Available CTP ({fmt(summary.derivedValues?.ctpTotal)}) + GRT ({fmt(summary.derivedValues?.grtTotal)}): {fmt((summary.balances?.totalAvailable || 0) - (summary.derivedValues?.baseTeamCash || 0))}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Distributed CTP + GRT: {fmt((summary.balances?.totalDistributed || 0) - (summary.derivedValues?.baseTeamCash || 0))}</div>
                            </div>
                        </div>
                    </div>

                    {/* Validations */}
                    {summary.validations && summary.validations.length > 0 && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--danger)' }}>Warnings</h4>
                            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                                {summary.validations.map((v, i) => <li key={i}>{v}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Table */}
                    <div className={styles.payoutTableWrap} style={{ background: 'var(--bg-card)', borderRadius: '8px', overflow: 'hidden' }}>
                        <table className={styles.dayPayoutTable}>
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>{summary.payouts?.roleGrouped ? 'Team Worked' : 'Role'}</th>
                                    <th>Points</th>
                                    <th>CTP</th>
                                    <th>GRT</th>
                                    <th>Cash</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* NEW FORMAT: ROLE GROUPED */}
                                {summary.payouts?.roleGrouped && (() => {
                                    const renderGroup = (label, arr, isRunner = false) => {
                                        if (!arr || arr.length === 0) return null;
                                        return (
                                            <React.Fragment key={label}>
                                                <tr className={styles.roleHeaderRow}><td colSpan={7}><span className={styles.roleHeaderLabel}>{label}</span></td></tr>
                                                {arr.map(p => (
                                                    <tr key={p.uid} className={styles.payoutRow}>
                                                        <td className={styles.nameCell}>{p.name}</td>
                                                        <td>{isRunner ? "Runner" : (p.teamId ? p.teamId.replace('team-', 'Team ') : "Bar")}</td>
                                                        {isRunner ? (
                                                            <td colSpan={4} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                {Object.entries(p.breakdown || {}).map(([src, val]) => `${src}: ${fmt(val)}`).join(' | ')}
                                                            </td>
                                                        ) : (
                                                            <>
                                                                <td className={styles.roleCell}>{p.points}</td>
                                                                <td>{fmt(p.ctp)}</td>
                                                                <td>{fmt(p.grt)}</td>
                                                                <td>{fmt(p.cash)}</td>
                                                            </>
                                                        )}
                                                        <td className={styles.totalCell}>{fmt(isRunner ? p.payoutAmount : p.total)}</td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    }

                                    return (
                                        <>
                                            {renderGroup("Captains", summary.payouts.roleGrouped.captains)}
                                            {renderGroup("Servers", summary.payouts.roleGrouped.servers)}
                                            {renderGroup("Backs", summary.payouts.roleGrouped.backs)}
                                            {renderGroup("SAs", summary.payouts.roleGrouped.bussers)}
                                            {renderGroup("Bar Team", summary.payouts.roleGrouped.bar)}
                                            {renderGroup("Runners", summary.payouts.roleGrouped.runners, true)}
                                        </>
                                    );
                                })()}


                                {/* OLD FORMATS FALLBACK (Legacy) */}
                                {!summary.payouts?.roleGrouped && (
                                    <>
                                        {/* Old Format: Team Employees */}
                                        {summary.payouts?.teamEmployees?.length > 0 && (
                                            <>
                                                <tr className={styles.roleHeaderRow}><td colSpan={7}><span className={styles.roleHeaderLabel}>Team Members (Legacy)</span></td></tr>
                                                {summary.payouts.teamEmployees.map(p => (
                                                    <tr key={p.uid} className={styles.payoutRow}>
                                                        <td className={styles.nameCell}>{p.name}</td>
                                                        <td>{p.role}</td>
                                                        <td className={styles.roleCell}>{p.points}</td>
                                                        <td>{fmt(p.ctp)}</td>
                                                        <td>{fmt(p.grt)}</td>
                                                        <td>{fmt(p.cash)}</td>
                                                        <td className={styles.totalCell}>{fmt(p.total)}</td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}

                                        {/* Grouped Team Employees */}
                                        {summary.payouts?.teamPayouts?.length > 0 && summary.payouts.teamPayouts.map((tGroup, idx) => (
                                            <React.Fragment key={tGroup.teamId}>
                                                <tr className={styles.roleHeaderRow}>
                                                    <td colSpan={7}><span className={styles.roleHeaderLabel}>Team {idx + 1}</span></td>
                                                </tr>
                                                {tGroup.payouts.map(p => (
                                                    <tr key={p.uid} className={styles.payoutRow}>
                                                        <td className={styles.nameCell}>{p.name}</td>
                                                        <td>{p.role}</td>
                                                        <td className={styles.roleCell}>{p.points}</td>
                                                        <td>{fmt(p.ctp)}</td>
                                                        <td>{fmt(p.grt)}</td>
                                                        <td>{fmt(p.cash)}</td>
                                                        <td className={styles.totalCell}>{fmt(p.total)}</td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}

                                        {/* Captain Overrides */}
                                        {summary.payouts?.captainsOverride?.length > 0 && (() => {
                                            const isGrouped = Array.isArray(summary.payouts.captainsOverride[0]?.payouts);
                                            if (isGrouped) {
                                                return summary.payouts.captainsOverride.map((tGroup, idx) => (
                                                    <React.Fragment key={"cap_ov_" + tGroup.teamId}>
                                                        <tr className={styles.roleHeaderRow}>
                                                            <td colSpan={7}><span className={styles.roleHeaderLabel}>Team {idx + 1} — Captain Overrides</span></td>
                                                        </tr>
                                                        {tGroup.payouts.map(p => (
                                                            <tr key={p.uid + "_ov"} className={styles.payoutRow}>
                                                                <td className={styles.nameCell}>{p.name}</td>
                                                                <td>Override</td>
                                                                <td className={styles.roleCell}>—</td>
                                                                <td>{fmt(p.ctp)}</td>
                                                                <td>{fmt(p.grt)}</td>
                                                                <td>—</td>
                                                                <td className={styles.totalCell}>{fmt(p.total)}</td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                ));
                                            } else {
                                                return (
                                                    <React.Fragment>
                                                        <tr className={styles.roleHeaderRow}>
                                                            <td colSpan={7}><span className={styles.roleHeaderLabel}>Captain Overrides</span></td>
                                                        </tr>
                                                        {summary.payouts.captainsOverride.map(p => (
                                                            <tr key={p.uid + "_ov"} className={styles.payoutRow}>
                                                                <td className={styles.nameCell}>{p.name}</td>
                                                                <td>Override</td>
                                                                <td className={styles.roleCell}>—</td>
                                                                <td>{fmt(p.ctp)}</td>
                                                                <td>{fmt(p.grt)}</td>
                                                                <td>—</td>
                                                                <td className={styles.totalCell}>{fmt(p.total)}</td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                );
                                            }
                                        })()}

                                        {/* Old Format: Bar Employees */}
                                        {summary.payouts?.barEmployees?.length > 0 && (
                                            <>
                                                <tr className={styles.roleHeaderRow}><td colSpan={7}><span className={styles.roleHeaderLabel}>Bar Team (Legacy)</span></td></tr>
                                                {summary.payouts.barEmployees.map(p => (
                                                    <tr key={p.uid} className={styles.payoutRow}>
                                                        <td className={styles.nameCell}>{p.name}</td>
                                                        <td>{p.role}</td>
                                                        <td className={styles.roleCell}>{p.points}</td>
                                                        <td>{fmt(p.ctp)}</td>
                                                        <td>{fmt(p.grt)}</td>
                                                        <td>{fmt(p.cash || 0)}</td>
                                                        <td className={styles.totalCell}>{fmt(p.total)}</td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}

                                        {/* Bar Employees */}
                                        {summary.payouts?.barPayouts?.length > 0 && (
                                            <>
                                                <tr className={styles.roleHeaderRow}><td colSpan={7}><span className={styles.roleHeaderLabel}>Bar Team</span></td></tr>
                                                {summary.payouts.barPayouts.map(p => (
                                                    <tr key={p.uid} className={styles.payoutRow}>
                                                        <td className={styles.nameCell}>{p.name}</td>
                                                        <td>{p.role}</td>
                                                        <td className={styles.roleCell}>{p.points}</td>
                                                        <td>{fmt(p.ctp)}</td>
                                                        <td>{fmt(p.grt)}</td>
                                                        <td>{fmt(p.cash || 0)}</td>
                                                        <td className={styles.totalCell}>{fmt(p.total)}</td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}

                                        {/* Runners */}
                                        {summary.payouts?.runners?.length > 0 && (
                                            <>
                                                <tr className={styles.roleHeaderRow}><td colSpan={7}><span className={styles.roleHeaderLabel}>Runners</span></td></tr>
                                                {summary.payouts.runners.map(p => (
                                                    <tr key={p.uid} className={styles.payoutRow}>
                                                        <td className={styles.nameCell}>{p.name}</td>
                                                        <td>Runner</td>
                                                        <td colSpan={4} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            {Object.entries(p.breakdown || {}).map(([src, val]) => `${src}: ${fmt(val)}`).join(' | ')}
                                                        </td>
                                                        <td className={styles.totalCell}>{fmt(p.payoutAmount)}</td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Shift Editor Panel ────────────────────────────────────────────────────────
function ShiftEditorPanel({ date, allEmployees, onClose }) {
    const [activeTab, setActiveTab] = useState("setup");

    // Teams & runners (UI state for assignment)
    const [teams, setTeams] = useState([
        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
    const [runners, setRunners] = useState([]);

    const updatePool = (teamId, field, value) => {
        setTeams(prev => prev.map(t =>
            t.teamId === teamId ? { ...t, pools: { ...t.pools, [field]: value } } : t
        ));
    };

    const addContract = (teamId) => {
        setTeams(prev => prev.map(t =>
            t.teamId === teamId ? { ...t, contracts: [...(t.contracts || []), { name: "", gratuity: "" }] } : t
        ));
    };

    const updateContract = (teamId, index, field, value) => {
        setTeams(prev => prev.map(t => {
            if (t.teamId === teamId) {
                const newContracts = [...(t.contracts || [])];
                newContracts[index] = { ...newContracts[index], [field]: value };
                return { ...t, contracts: newContracts };
            }
            return t;
        }));
    };

    const removeContract = (teamId, index) => {
        setTeams(prev => prev.map(t => {
            if (t.teamId === teamId) {
                const newContracts = [...(t.contracts || [])];
                newContracts.splice(index, 1);
                return { ...t, contracts: newContracts };
            }
            return t;
        }));
    };

    const updateBarPool = (field, value) => {
        setBarTeam(prev => ({ ...prev, pools: { ...prev.pools, [field]: value } }));
    };

    // Payouts state
    const [payouts, setPayouts] = useState(null);
    const [summary, setSummary] = useState(null);
    const [saveStatus, setSaveStatus] = useState("");
    const [loading, setLoading] = useState(true);

    // Load existing shift data on open
    useEffect(() => {
        const loadShift = async () => {
            try {
                const shiftDoc = await getDoc(doc(db, "shifts", date));
                if (shiftDoc.exists()) {
                    const d = shiftDoc.data();

                    if (d.teams) {
                        setTeams(d.teams.map(t => ({
                            teamId: t.teamId,
                            members: t.members || [],
                            pools: t.pools || { sales: t.teamSales || "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" },
                            contracts: t.contracts || []
                        })));
                    }
                    if (d.barTeam) {
                        setBarTeam({
                            members: d.barTeam.members || [],
                            pools: d.barTeam.pools || { sales: "", tips: "", gratuity: "", covers: "" }
                        });
                    }
                    if (d.runners) setRunners(d.runners);

                    if (d.payouts) setPayouts(d.payouts);
                    if (d.summary) setSummary(d.summary);
                }
            } catch (e) {
                console.error("Failed to load shift:", e);
            } finally {
                setLoading(false);
            }
        };
        loadShift();
    }, [date]);

    // ── Calculate & Save ──
    const handleCalculateAndSave = async () => {
        setSaveStatus("Calculating...");

        const inputs = {
            teams,
            barTeam,
            runners
        };

        const result = calculateShift(inputs);

        // Map payouts back into an object by UID so old `users/{uid}/tips` data saves cleanly
        const mappedPayoutsForFirebase = {};

        const attachToMapped = (arr, globalRole) => {
            if (!arr) return;
            arr.forEach(p => {
                mappedPayoutsForFirebase[p.uid] = {
                    name: p.name,
                    role: p.role || globalRole,
                    points: p.points || 0,
                    tips: p.ctp !== undefined ? p.ctp : (p.payoutAmount || 0),
                    gratuity: p.grt || 0,
                    cash: p.cash || 0,
                    wineBonus: 0,
                    total: p.total !== undefined ? p.total : (p.payoutAmount || 0)
                };
            });
        };

        if (result.payouts?.roleGrouped) {
            attachToMapped(result.payouts.roleGrouped.captains, 'captain');
            attachToMapped(result.payouts.roleGrouped.servers, 'server');
            attachToMapped(result.payouts.roleGrouped.backs, 'back');
            attachToMapped(result.payouts.roleGrouped.bussers, 'busser');
            attachToMapped(result.payouts.roleGrouped.bar, 'bartender');
            attachToMapped(result.payouts.roleGrouped.runners, 'runner');
        }

        setPayouts(mappedPayoutsForFirebase);
        setSummary(result);

        setSaveStatus("Saving...");
        try {
            await setDoc(doc(db, "shifts", date), {
                date,
                teams,
                barTeam,
                runners,
                payouts: mappedPayoutsForFirebase,
                summary: result, // Save the full result as summary
                updatedAt: new Date().toISOString(),
            });

            if (mappedPayoutsForFirebase) {
                const saves = Object.entries(mappedPayoutsForFirebase).map(([uid, payout]) =>
                    setDoc(doc(db, "users", uid, "tips", date), {
                        gratuity: payout.gratuity,
                        tip: payout.tips,
                        cash: payout.cash,
                        wineBonus: payout.wineBonus,
                        role: payout.role,
                        shiftDate: date,
                        updatedAt: new Date().toISOString(),
                    }, { merge: true })
                );
                await Promise.all(saves);
            }
            setSaveStatus("✅ Saved!");
        } catch (e) {
            console.error(e);
            setSaveStatus("❌ Failed to save.");
        }
    };

    const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;


    return (
        <div className={styles.editorPanel}>
            {/* Header */}
            <div className={styles.editorHeader}>
                <div>
                    <h2 className={styles.editorTitle}>Shift — {date}</h2>
                    {saveStatus && <span className={styles.saveStatus}>{saveStatus}</span>}
                </div>
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
                {["setup", "pools"].map((t) => (
                    <button
                        key={t}
                        className={`${styles.tab} ${activeTab === t ? styles.tabActive : ""}`}
                        onClick={() => setActiveTab(t)}
                    >
                        {t === "setup" ? "1. Team Setup" : "2. Pool Inputs"}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className={styles.loadingMsg}>Loading shift data...</div>
            ) : (
                <div className={styles.modalBody}>

                    {/* ── Tab 1: Team Setup ── */}
                    {activeTab === "setup" && (
                        <div>
                            <ShiftSetupDnd
                                allEmployees={allEmployees}
                                teams={teams} setTeams={setTeams}
                                barTeam={barTeam} setBarTeam={setBarTeam}
                                runners={runners} setRunners={setRunners}
                            />

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                                <button className={styles.nextBtn} onClick={() => setActiveTab("pools")}>
                                    Next: Pool Inputs →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Tab 2: Pool Inputs ── */}
                    {activeTab === "pools" && (
                        <div>
                            <div className={styles.poolsLayout} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', width: '100%', maxWidth: '800px', margin: '0 auto 2rem' }}>
                                {/* Teams */}
                                {teams.map((t, idx) => (
                                    <div key={t.teamId} className={styles.poolCard} style={{ margin: 0 }}>
                                        <div className={styles.poolCardHeader}>
                                            <span className={styles.poolCardTitle}>Team {idx + 1} ({t.members.length} members)</span>
                                        </div>
                                        <div className={styles.poolFieldGrid}>
                                            <PoolField label="Sales ($)" value={t.pools.sales} onChange={(v) => updatePool(t.teamId, "sales", v)} />
                                            <PoolField label="Tips (CTP) ($)" value={t.pools.tips} onChange={(v) => updatePool(t.teamId, "tips", v)} />
                                            <PoolField label="Gratuity ($)" value={t.pools.gratuity} onChange={(v) => updatePool(t.teamId, "gratuity", v)} />
                                            <PoolField label="Cash ($)" value={t.pools.cash} onChange={(v) => updatePool(t.teamId, "cash", v)} />
                                            <PoolField label="Covers" value={t.pools.covers} onChange={(v) => updatePool(t.teamId, "covers", v)} />

                                            {/* Legacy Contract Fallback */}
                                            {t.pools.contract26Gratuity && (!t.contracts || t.contracts.length === 0) && (
                                                <PoolField label="Legacy Contract Grat ($)" value={t.pools.contract26Gratuity} onChange={(v) => updatePool(t.teamId, "contract26Gratuity", v)} />
                                            )}
                                        </div>

                                        {/* Dynamic Contracts Section */}
                                        <div style={{ marginTop: '0', borderTop: '1px solid var(--border)', paddingTop: '0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: t._showContracts ? '0.5rem' : '0', marginTop: '0.75rem' }}>
                                                <button
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--text-main)',
                                                        fontWeight: 600,
                                                        fontSize: '0.95rem',
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem'
                                                    }}
                                                    onClick={() => {
                                                        setTeams(prev => prev.map(pt => pt.teamId === t.teamId ? { ...pt, _showContracts: !pt._showContracts } : pt));
                                                    }}
                                                >
                                                    <span style={{ transform: t._showContracts ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block', fontSize: '0.8rem' }}>▶</span>
                                                    Contracts {t.contracts && t.contracts.length > 0 ? `(${t.contracts.length})` : ''}
                                                </button>

                                                {t._showContracts && (
                                                    <button
                                                        onClick={() => addContract(t.teamId)}
                                                        style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                                    >
                                                        + Add Contract
                                                    </button>
                                                )}
                                            </div>

                                            {t._showContracts && (
                                                t.contracts && t.contracts.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                                                        {t.contracts.map((contract, cIdx) => (
                                                            <div key={cIdx} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.4rem', borderRadius: '4px' }}>
                                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', width: '20px', textAlign: 'center' }}>#{cIdx + 1}</span>
                                                                <div style={{ flex: 1, display: 'flex' }}>
                                                                    <div style={{ position: 'relative', width: '100%' }}>
                                                                        <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>$</span>
                                                                        <input
                                                                            type="number"
                                                                            min="0" step="0.01"
                                                                            placeholder="26% Gratuity Amount"
                                                                            value={contract.gratuity}
                                                                            onChange={(e) => updateContract(t.teamId, cIdx, "gratuity", e.target.value)}
                                                                            className={styles.noSpinners}
                                                                            style={{ padding: '0.3rem 0.3rem 0.3rem 1.2rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', width: '100%', fontSize: '0.85rem' }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => removeContract(t.teamId, cIdx)}
                                                                    style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', padding: '0.2rem', fontSize: '1.2rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    title="Remove Contract"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem', marginTop: '0.4rem', border: '1px dashed var(--border)', borderRadius: '4px' }}>
                                                        No contracts added. Click '+ Add Contract' to input a contract amount.
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Bar Team */}
                                <div className={styles.poolCard} style={{ margin: 0 }}>
                                    <div className={styles.poolCardHeader}>
                                        <span className={styles.poolCardTitle}>Bar Team ({barTeam.members.length} members)</span>
                                    </div>
                                    <div className={styles.poolFieldGrid}>
                                        <PoolField label="Bar Sales ($)" value={barTeam.pools.sales} onChange={(v) => updateBarPool("sales", v)} />
                                        <PoolField label="Tips (CTP) ($)" value={barTeam.pools.tips} onChange={(v) => updateBarPool("tips", v)} />
                                        <PoolField label="Gratuity ($)" value={barTeam.pools.gratuity} onChange={(v) => updateBarPool("gratuity", v)} />
                                        <PoolField label="Covers" value={barTeam.pools.covers} onChange={(v) => updateBarPool("covers", v)} />
                                        <PoolField label="Runners Transfer ($)" value={barTeam.pools.runners} onChange={(v) => updateBarPool("runners", v)} />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.saveRow}>
                                {saveStatus && <span className={styles.saveStatus}>{saveStatus}</span>}
                                <button className={styles.saveBtn} onClick={handleCalculateAndSave}>
                                    Calculate &amp; Save Shift ✓
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PoolField({ label, value, onChange, hint }) {
    return (
        <div className={styles.poolField}>
            <label className={styles.label}>{label}</label>
            {hint && <span className={styles.hint}>{hint}</span>}
            <input
                id={`pool-field-${label.replace(/\s+/g, '-').toLowerCase()}`}
                type="number"
                min="0"
                step="0.01"
                className={styles.input}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="0.00"
                aria-label={label}
            />
        </div>
    );
}

// ─── Admin Reports Panel ─────────────────────────────────────────────────────
function AdminReportsPanel() {
    const [viewMode, setViewMode] = useState("week"); // "week" | "month"
    const [baseDateStr, setBaseDateStr] = useState(() => new Date().toISOString().split("T")[0]);
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);

    const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

    // Compute range based on selected date and view mode
    const { startStr, endStr, displayLabel, dateKeys } = React.useMemo(() => {
        const d = new Date(baseDateStr + "T12:00:00");
        let keys = [];
        let start, end, label;

        if (viewMode === "week") {
            const weekDates = getCurrentWeek(d);
            start = weekDates[0];
            end = weekDates[6];
            keys = weekDates.map(wd => wd.toISOString().split("T")[0]);

            label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        } else {
            const year = d.getFullYear();
            const month = d.getMonth();
            start = new Date(year, month, 1);
            end = new Date(year, month + 1, 0);

            const dayCount = end.getDate();
            for (let i = 1; i <= dayCount; i++) {
                const md = new Date(year, month, i);
                keys.push(md.toISOString().split("T")[0]);
            }
            label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        }

        return {
            startStr: start.toISOString().split("T")[0],
            endStr: end.toISOString().split("T")[0],
            displayLabel: label,
            dateKeys: keys
        };
    }, [baseDateStr, viewMode]);

    // Fetch shift data for the range
    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);
            try {
                const q = query(collection(db, "shifts"), where("date", ">=", startStr), where("date", "<=", endStr));
                const snap = await getDocs(q);
                const shiftMap = {};

                snap.docs.forEach(d => {
                    shiftMap[d.id] = d.data();
                });

                // Build dayList formatted identically to the BiweeklySummary payload
                const list = dateKeys.map(key => {
                    const sd = shiftMap[key];
                    let t = 0, g = 0, c = 0, rev = 0, w = 0, liq = 0;
                    if (sd) {
                        rev = (sd.summary?.derivedValues?.totalTeamSales || sd.summary?.normalizedInputs?.teamSales || 0) + (sd.summary?.normalizedInputs?.barSales || 0);

                        if (sd.payouts) {
                            Object.values(sd.payouts).forEach(p => {
                                t += Number(p.tips) || 0;
                                g += Number(p.gratuity) || 0;
                                c += Number(p.cash) || 0;
                            });
                        }
                    }
                    return {
                        date: key, tip: t, gratuity: g, cash: c,
                        revenue: rev,
                        payouts: sd?.payouts || {}
                    };
                });
                setReportData(list);
            } catch (e) {
                console.error("Failed to load reports:", e);
            }
            setLoading(false);
        };
        fetchReport();
    }, [startStr, endStr, dateKeys]);

    const handleExport = () => {
        if (viewMode === 'month') {
            generateMonthlyReport(displayLabel, reportData);
        } else {
            // week report takes the data, label, and unused allData (null is fine)
            generateWeeklyReport(reportData, displayLabel, null);
        }
    };

    const totals = reportData.reduce((acc, d) => ({
        tips: acc.tips + d.tip,
        gratuity: acc.gratuity + d.gratuity,
        cash: acc.cash + d.cash,
        revenue: acc.revenue + d.revenue,
        total: acc.total + d.tip + d.gratuity + d.cash
    }), { tips: 0, gratuity: 0, cash: 0, revenue: 0, total: 0 });

    const changePeriod = (delta) => {
        const d = new Date(baseDateStr + "T12:00:00");
        if (viewMode === 'week') {
            d.setDate(d.getDate() + (delta * 7));
        } else {
            d.setMonth(d.getMonth() + delta);
        }
        setBaseDateStr(d.toISOString().split("T")[0]);
    };

    return (
        <div className={styles.payoutPanel}>
            <div className={styles.payoutPanelHeader}>
                <h3 className={styles.payoutPanelTitle}>Financial Reports</h3>
                {reportData.length > 0 && (
                    <button className={styles.exportBtn} onClick={handleExport} disabled={loading}>
                        {loading ? "Loading..." : "Export PDF"}
                    </button>
                )}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '1rem', padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
                <select value={viewMode} onChange={e => setViewMode(e.target.value)} className={styles.dateInput} style={{ cursor: 'pointer', padding: '0.4rem 0.8rem' }}>
                    <option value="week">Weekly Report</option>
                    <option value="month">Monthly Report</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className={styles.dayNavBtn} onClick={() => changePeriod(-1)} title="Previous">←</button>
                    <input
                        type="date"
                        value={baseDateStr}
                        onChange={e => setBaseDateStr(e.target.value)}
                        className={styles.dateInput}
                    />
                    <button className={styles.dayNavBtn} onClick={() => changePeriod(1)} title="Next">→</button>
                </div>
            </div>

            {/* Summary Body */}
            <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{displayLabel}</h4>
                </div>

                <div className={styles.totalSummary} style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <span>Rev: <strong>{fmt(totals.revenue)}</strong></span>
                    <span>Tips: <strong>{fmt(totals.tips)}</strong></span>
                    <span>Grat: <strong>{fmt(totals.gratuity)}</strong></span>
                    <span>Cash: <strong>{fmt(totals.cash)}</strong></span>
                    <span style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                        Period Pool: <strong style={{ color: 'var(--primary)' }}>{fmt(totals.total)}</strong>
                    </span>
                </div>

                {loading ? (
                    <div className={styles.payoutEmpty}>Loading shift data...</div>
                ) : (
                    <div className={styles.payoutTableWrap}>
                        <table className={styles.dayPayoutTable}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Rev</th>
                                    <th>Tips</th>
                                    <th>Gratuity</th>
                                    <th>Cash</th>
                                    <th>Daily Pool</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.map(d => {
                                    const dailyTotal = d.tip + d.gratuity + d.cash;
                                    const noData = dailyTotal === 0 && Object.keys(d.payouts).length === 0;
                                    return (
                                        <tr key={d.date} className={styles.payoutRow} style={{ opacity: noData ? 0.5 : 1 }}>
                                            <td style={{ fontWeight: 500 }}>{new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
                                            <td>{fmt(d.revenue)}</td>
                                            <td>{fmt(d.tip)}</td>
                                            <td>{fmt(d.gratuity)}</td>
                                            <td>{fmt(d.cash)}</td>
                                            <td className={styles.totalCell}>{fmt(dailyTotal)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminDashboard;
