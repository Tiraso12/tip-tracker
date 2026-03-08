import React, { useState, useEffect, useCallback } from "react";
import styles from "./AdminDashboard.module.css";
import { calculateDistribution, ROLE_POINTS, RUNNER_FLAT_RATE } from "../../utils/distributionUtils";
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

const emptyTeamPools = () => ({ tips: "", gratuity: "", cash: "", sales: "", wine: "", liquor: "" });
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

    // Group payouts by role in a defined order
    const grouped = payouts
        ? ROLE_ORDER.reduce((acc, role) => {
            const members = Object.entries(payouts)
                .filter(([, p]) => p.role === role)
                .map(([uid, p]) => ({ uid, ...p }));
            if (members.length) acc.push({ role, members });
            return acc;
        }, [])
        : [];

    // Compute column totals
    const totals = payouts
        ? Object.values(payouts).reduce(
            (acc, p) => ({
                tips: acc.tips + (Number(p.tips) || 0),
                gratuity: acc.gratuity + (Number(p.gratuity) || 0),
                cash: acc.cash + (Number(p.cash) || 0),
                wineBonus: acc.wineBonus + (Number(p.wineBonus) || 0),
                total: acc.total + (Number(p.total) || 0),
            }),
            { tips: 0, gratuity: 0, cash: 0, wineBonus: 0, total: 0 }
        )
        : null;

    return (
        <div className={styles.payoutPanel}>
            <div className={styles.payoutPanelHeader}>
                <h3 className={styles.payoutPanelTitle}>Day Payouts <span className={styles.payoutPanelDate}>• {displayDate}</span></h3>
                {payouts && Object.keys(payouts).length > 0 && (
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
            ) : !payouts ? (
                <div className={styles.payoutEmpty}>
                    <span className={styles.payoutEmptyIcon}>📋</span>
                    <p>No shift saved for this date.</p>
                    <p className={styles.payoutEmptyHint}>Open the shift editor to input and calculate payouts.</p>
                </div>
            ) : (
                <>
                    {/* Summary mini-bar */}
                    {summary && (
                        <div className={styles.daySummaryBar}>
                            <span>Revenue: <strong>{fmt(summary.totalRevenue)}</strong></span>
                            {summary.runnerCostTotal > 0 && <span>Runners: <strong>{fmt(summary.runnerCostTotal)}</strong></span>}
                            {summary.wineBonusTotal > 0 && <span>Wine bonus: <strong>{fmt(summary.wineBonusTotal)}</strong></span>}
                            {summary.isContract && <span className={styles.contractBadge}>Contract</span>}
                        </div>
                    )}

                    {/* Table */}
                    <div className={styles.payoutTableWrap}>
                        <table className={styles.dayPayoutTable}>
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Points</th>
                                    <th>Tips</th>
                                    <th>Gratuity</th>
                                    <th>Cash</th>
                                    <th>Wine+</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grouped.map(({ role, members }) => (
                                    <React.Fragment key={role}>
                                        {/* Role section header */}
                                        <tr className={styles.roleHeaderRow}>
                                            <td colSpan={7}>
                                                <span className={styles.roleHeaderLabel}>
                                                    {ROLE_LABELS[role] ?? role}
                                                </span>
                                            </td>
                                        </tr>
                                        {members.map((p) => (
                                            <tr key={p.uid} className={styles.payoutRow}>
                                                <td className={styles.nameCell}>{p.name}</td>
                                                <td className={styles.roleCell}>{p.points}</td>
                                                <td>{fmt(p.tips)}</td>
                                                <td>{fmt(p.gratuity)}</td>
                                                <td>{fmt(p.cash)}</td>
                                                <td>{p.wineBonus > 0 ? fmt(p.wineBonus) : <span className={styles.dash}>—</span>}</td>
                                                <td className={styles.totalCell}>{fmt(p.total)}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                            {/* Column totals footer */}
                            {totals && (
                                <tfoot>
                                    <tr className={styles.totalsRow}>
                                        <td colSpan={2} className={styles.totalsLabel}>Totals</td>
                                        <td>{fmt(totals.tips)}</td>
                                        <td>{fmt(totals.gratuity)}</td>
                                        <td>{fmt(totals.cash)}</td>
                                        <td>{totals.wineBonus > 0 ? fmt(totals.wineBonus) : <span className={styles.dash}>—</span>}</td>
                                        <td className={styles.totalCell}>{fmt(totals.total)}</td>
                                    </tr>
                                </tfoot>
                            )}
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

    // Teams & runners
    const [teams, setTeams] = useState([
        emptyTeam("team-1"),
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: emptyTeamPools() });
    const [runners, setRunners] = useState([]);

    // Per-team contract helpers
    const addContractToTeam = (ti) => setTeams(prev => {
        const updated = [...prev];
        updated[ti] = { ...updated[ti], contracts: [...(updated[ti].contracts || []), { id: Date.now().toString(), gratAmount: '', includeBarInPool: false, poolPercent: 18 }] };
        return updated;
    });
    const removeContractFromTeam = (ti, cid) => setTeams(prev => {
        const updated = [...prev];
        updated[ti] = { ...updated[ti], contracts: updated[ti].contracts.filter(c => c.id !== cid) };
        return updated;
    });
    const updateContractInTeam = (ti, cid, field, value) => setTeams(prev => {
        const updated = [...prev];
        updated[ti] = { ...updated[ti], contracts: updated[ti].contracts.map(c => c.id === cid ? { ...c, [field]: value } : c) };
        return updated;
    });

    // Wine / Liquor are now per-team inside each team's pools

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
                        // Ensure each team has contracts + wine/liquor fields
                        setTeams(d.teams.map(t => ({
                            ...t,
                            contracts: t.contracts || [],
                            pools: {
                                tips: t.pools?.tips ?? "",
                                gratuity: t.pools?.gratuity ?? "",
                                cash: t.pools?.cash ?? "",
                                sales: t.pools?.sales ?? "",
                                wine: t.pools?.wine ?? "",
                                liquor: t.pools?.liquor ?? "",
                            }
                        })));
                    }
                    if (d.barTeam) setBarTeam(d.barTeam);
                    if (d.runners) setRunners(d.runners);
                    // Legacy global contracts → migrate onto first team
                    if (d.contracts?.length && !d.teams?.[0]?.contracts?.length) {
                        setTeams(prev => prev.map((t, i) => i === 0 ? { ...t, contracts: d.contracts } : t));
                    } else if (d.isContract && d.contractGratAmount) {
                        setTeams(prev => prev.map((t, i) => i === 0 ? { ...t, contracts: [{ id: 'legacy', gratAmount: String(d.contractGratAmount), includeBarInPool: d.includeBarInPool || false }] } : t));
                    }
                    // Legacy global wine/liquor → migrate onto first team
                    if (d.wineAmount !== undefined || d.liquorAmount !== undefined) {
                        setTeams(prev => prev.map((t, i) => i === 0 ? {
                            ...t,
                            pools: {
                                ...t.pools,
                                wine: t.pools.wine || String(d.wineAmount || ""),
                                liquor: t.pools.liquor || String(d.liquorAmount || ""),
                            }
                        } : t));
                    }
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

    // ── Team member management ──
    const updateTeamPool = (ti, field, value) => {
        setTeams((prev) => {
            const updated = [...prev];
            updated[ti] = { ...updated[ti], pools: { ...updated[ti].pools, [field]: value } };
            return updated;
        });
    };

    const updateBarPool = (field, value) => setBarTeam((prev) => ({ ...prev, pools: { ...prev.pools, [field]: value } }));

    // ── Calculate & Save ──
    const handleCalculateAndSave = async () => {
        setSaveStatus("Calculating...");
        // Flatten all per-team contracts for distribution engine
        const allContracts = teams.flatMap(t =>
            (t.contracts || []).map(c => ({
                ...c,
                gratAmount: Number(c.gratAmount) || 0,
                poolPercent: Number(c.poolPercent ?? 18)
            }))
        );
        // Sum wine and liquor across all restaurant teams
        const totalWine = teams.reduce((s, t) => s + (Number(t.pools.wine) || 0), 0);
        const totalLiquor = teams.reduce((s, t) => s + (Number(t.pools.liquor) || 0), 0);
        const result = calculateDistribution({
            restaurantTeams: teams,
            barTeam,
            runners,
            wineAmount: totalWine,
            liquorAmount: totalLiquor,
            contracts: allContracts,
        });

        const newPayouts = result.payouts;
        const newSummary = result.summary;
        setPayouts(newPayouts);
        setSummary(newSummary);

        setSaveStatus("Saving...");
        try {
            await setDoc(doc(db, "shifts", date), {
                date,
                teams,  // pools.wine, pools.liquor, contracts[] all inside each team
                barTeam,
                runners,
                payouts: newPayouts,
                summary: newSummary,
                updatedAt: new Date().toISOString(),
            });

            if (newPayouts) {
                const saves = Object.entries(newPayouts).map(([uid, payout]) =>
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
    const totalPoolTips = teams.reduce((s, t) => s + (Number(t.pools.tips) || 0), 0) + (Number(barTeam.pools.tips) || 0);
    const totalPoolGrat = teams.reduce((s, t) => s + (Number(t.pools.gratuity) || 0), 0) + (Number(barTeam.pools.gratuity) || 0);
    const totalPoolCash = teams.reduce((s, t) => s + (Number(t.pools.cash) || 0), 0) + (Number(barTeam.pools.cash) || 0);

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

                    {/* ── Tab 2: Pool Inputs — card grid ── */}
                    {activeTab === "pools" && (
                        <div>
                            {/* Contract summaries banner */}
                            {teams.some(t => (t.contracts || []).length > 0) && (
                                <div className={styles.contractInfo}>
                                    {teams.flatMap((t, ti) =>
                                        (t.contracts || []).filter(c => Number(c.gratAmount) > 0).map((c, ci) => {
                                            const pPct = Number(c.poolPercent ?? 18);
                                            const poolVal = Number(c.gratAmount) * (pPct / 26);
                                            const sepVal = Number(c.gratAmount) * ((26 - pPct) / 26);
                                            return (
                                                <span key={c.id}>
                                                    T{ti + 1} Contract {ci + 1} — Pool {pPct}%: <strong>${Math.round(poolVal)}</strong> | Separate {26 - pPct}%: <strong>${Math.round(sepVal)}</strong>
                                                    {c.includeBarInPool && <em> (bar)</em>}
                                                </span>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            {/* Restaurant team cards — 2 column grid */}
                            <div className={styles.poolGrid}>
                                {teams.map((team, ti) => (
                                    <div key={team.teamId} className={styles.poolCard}>
                                        <div className={styles.poolCardHeader}>
                                            <span className={styles.poolCardTitle}>Team {ti + 1}</span>
                                            <span className={styles.memberCount}>{team.members.length} members</span>
                                        </div>

                                        <div className={styles.poolFieldGrid}>
                                            <PoolField label="Sales ($)" value={team.pools.sales} onChange={(v) => updateTeamPool(ti, "sales", v)} />
                                            <PoolField label="Tips" value={team.pools.tips} onChange={(v) => updateTeamPool(ti, "tips", v)} />
                                            <PoolField label="Gratuity" value={team.pools.gratuity} onChange={(v) => updateTeamPool(ti, "gratuity", v)} />
                                            <PoolField label="Cash" value={team.pools.cash} onChange={(v) => updateTeamPool(ti, "cash", v)} />
                                            <PoolField label="Wine Sales ($)" value={team.pools.wine} onChange={(v) => updateTeamPool(ti, "wine", v)} />
                                            <PoolField label="Liquor Sales ($)" value={team.pools.liquor} onChange={(v) => updateTeamPool(ti, "liquor", v)} />
                                        </div>

                                        {/* Per-team contracts */}
                                        <details className={styles.teamContractDetails}>
                                            <summary className={styles.teamContractSummary}>
                                                <span>Contracts</span>
                                                <span className={styles.contractsBadge}>
                                                    {(team.contracts || []).length === 0 ? 'None' : `${team.contracts.length}`}
                                                </span>
                                                <button
                                                    className={styles.addContractMini}
                                                    onClick={(e) => { e.preventDefault(); addContractToTeam(ti); }}
                                                >+ Add</button>
                                            </summary>
                                            <div className={styles.teamContractList}>
                                                {(team.contracts || []).length === 0 && (
                                                    <p className={styles.emptyMsg} style={{ margin: 0, fontSize: '0.72rem' }}>No contracts.</p>
                                                )}
                                                {(team.contracts || []).map((c, ci) => (
                                                    <div key={c.id} className={styles.contractCard}>
                                                        <span className={styles.contractLabel}>#{ci + 1}</span>
                                                        <input
                                                            type="number"
                                                            className={styles.inlineInput}
                                                            placeholder="Amount ($)"
                                                            value={c.gratAmount}
                                                            aria-label={`Gratuity amount for contract ${ci + 1}`}
                                                            onChange={(e) => updateContractInTeam(ti, c.id, 'gratAmount', e.target.value)}
                                                        />
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                            <input
                                                                type="number"
                                                                className={styles.inlineInput}
                                                                style={{ width: '60px' }}
                                                                placeholder="%"
                                                                value={c.poolPercent ?? 18}
                                                                aria-label="Pool Percentage"
                                                                onChange={(e) => updateContractInTeam(ti, c.id, 'poolPercent', e.target.value)}
                                                            />
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ 26</span>
                                                        </div>
                                                        <label className={styles.barPoolToggle}>
                                                            <input
                                                                type="checkbox"
                                                                checked={c.includeBarInPool}
                                                                onChange={(e) => updateContractInTeam(ti, c.id, 'includeBarInPool', e.target.checked)}
                                                            />
                                                            Bar
                                                        </label>
                                                        <button className={styles.removeContractBtn} onClick={() => removeContractFromTeam(ti, c.id)}>✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    </div>
                                ))}

                                {/* Bar card */}
                                <div className={styles.poolCard}>
                                    <div className={styles.poolCardHeader}>
                                        <span className={styles.poolCardTitle}>Bar Team</span>
                                        <span className={styles.memberCount}>{barTeam.members.length} members</span>
                                    </div>
                                    <div className={styles.poolFieldGrid}>
                                        <PoolField label="Tips" value={barTeam.pools.tips} onChange={(v) => updateBarPool("tips", v)} />
                                        <PoolField label="Gratuity" value={barTeam.pools.gratuity} onChange={(v) => updateBarPool("gratuity", v)} />
                                        <PoolField label="Cash" value={barTeam.pools.cash} onChange={(v) => updateBarPool("cash", v)} />
                                    </div>
                                </div>

                            </div>

                            {/* Totals bar */}
                            <div className={styles.totalSummary}>
                                <span>Total Tips: <strong>{fmt(totalPoolTips)}</strong></span>
                                <span>Total Grat: <strong>{fmt(totalPoolGrat)}</strong></span>
                                <span>Total Cash: <strong>{fmt(totalPoolCash)}</strong></span>
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
                        rev = sd.summary?.totalRevenue || 0;
                        liq = sd.summary?.liquorAmount || Number(sd.liquorAmount) || 0;
                        w = sd.teams ? sd.teams.reduce((s, team) => s + (Number(team.pools?.wine) || 0), 0) : (Number(sd.wineAmount) || 0);

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
                        revenue: rev, wine: w, liquor: liq,
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
        wine: acc.wine + d.wine,
        liquor: acc.liquor + d.liquor,
        total: acc.total + d.tip + d.gratuity + d.cash
    }), { tips: 0, gratuity: 0, cash: 0, revenue: 0, wine: 0, liquor: 0, total: 0 });

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
                    <span>Wine: <strong>{fmt(totals.wine)}</strong></span>
                    <span>Liq: <strong>{fmt(totals.liquor)}</strong></span>
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
                                    <th>Wine</th>
                                    <th>Liq</th>
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
                                            <td>{fmt(d.wine)}</td>
                                            <td>{fmt(d.liquor)}</td>
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
