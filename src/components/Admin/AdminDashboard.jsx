import React, { useState, useEffect } from "react";
import styles from "./AdminDashboard.module.css";
import { calculateDistribution, ROLE_POINTS, RUNNER_FLAT_RATE } from "../../utils/distributionUtils";
import { db } from "../../config/firebase";
import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";

const RESTAURANT_ROLES = ["captain", "server", "b-server", "a-server"];
const ROLE_LABELS = {
    captain: "Captain (4pts)",
    server: "Server (4pts)",
    "b-server": "B Server (2.5pts)",
    "a-server": "A Server (2pts)",
    bartender: "Bartender",
    runner: `Runner (flat $${RUNNER_FLAT_RATE})`,
};

const emptyTeamPools = () => ({ tips: "", gratuity: "", cash: "" });
const emptyTeam = (teamId) => ({ teamId, members: [], pools: emptyTeamPools() });

// ─── Main Component ──────────────────────────────────────────────────────────
function AdminDashboard() {
    const { logout } = useAuth();
    const [allEmployees, setAllEmployees] = useState([]);

    // Selected date for viewing/editing a shift
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [modalOpen, setModalOpen] = useState(false);

    // Fetch all employees once
    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const snapshot = await getDocs(collection(db, "users"));
                setAllEmployees(snapshot.docs.map((d) => ({ uid: d.id, ...d.data() })));
            } catch (e) {
                console.error("Failed to fetch employees:", e);
            }
        };
        fetchEmployees();
    }, []);

    return (
        <div className={styles.dashboard}>
            {/* Top bar */}
            <div className={styles.topBar}>
                <div className={styles.topBarLeft}>
                    <h1 className={styles.appTitle}>TipTracker</h1>
                    <span className={styles.adminBadge}>Admin</span>
                </div>
                <button className={styles.logoutBtn} onClick={logout}>Log Out</button>
            </div>

            {/* Central panel */}
            <div className={styles.centerPanel}>
                <h2 className={styles.panelTitle}>Shift Distribution</h2>
                <p className={styles.panelSubtitle}>Select a date to view, input, or edit tip distribution for that shift.</p>

                <div className={styles.dateRow}>
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />
                    <button className={styles.openBtn} onClick={() => setModalOpen(true)}>
                        Open Shift →
                    </button>
                </div>
            </div>

            {/* Shift Modal */}
            {modalOpen && (
                <ShiftModal
                    date={selectedDate}
                    allEmployees={allEmployees}
                    onClose={() => setModalOpen(false)}
                />
            )}
        </div>
    );
}

// ─── Shift Modal ─────────────────────────────────────────────────────────────
function ShiftModal({ date, allEmployees, onClose }) {
    const [activeTab, setActiveTab] = useState("setup");

    // Teams & runners
    const [teams, setTeams] = useState([
        emptyTeam("team-1"),
        emptyTeam("team-2"),
        emptyTeam("team-3"),
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: emptyTeamPools() });
    const [runners, setRunners] = useState([]);

    // Contract
    const [isContract, setIsContract] = useState(false);
    const [contractGratAmount, setContractGratAmount] = useState("");

    // Wine / Liquor (global)
    const [wineAmount, setWineAmount] = useState("");
    const [liquorAmount, setLiquorAmount] = useState("");

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
                    if (d.teams) setTeams(d.teams);
                    if (d.barTeam) setBarTeam(d.barTeam);
                    if (d.runners) setRunners(d.runners);
                    if (d.isContract !== undefined) setIsContract(d.isContract);
                    if (d.contractGratAmount !== undefined) setContractGratAmount(String(d.contractGratAmount));
                    if (d.wineAmount !== undefined) setWineAmount(String(d.wineAmount));
                    if (d.liquorAmount !== undefined) setLiquorAmount(String(d.liquorAmount));
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

    const isAssigned = (uid) =>
        teams.some((t) => t.members.some((m) => m.uid === uid)) ||
        barTeam.members.some((m) => m.uid === uid) ||
        runners.some((m) => m.uid === uid);

    // ── Team member management ──
    const addToTeam = (ti, emp, role) => {
        if (isAssigned(emp.uid)) return;
        setTeams((prev) => {
            const updated = [...prev];
            updated[ti] = { ...updated[ti], members: [...updated[ti].members, { uid: emp.uid, name: emp.username, role }] };
            return updated;
        });
    };
    const removeFromTeam = (ti, uid) => {
        setTeams((prev) => {
            const updated = [...prev];
            updated[ti] = { ...updated[ti], members: updated[ti].members.filter((m) => m.uid !== uid) };
            return updated;
        });
    };
    const updateTeamPool = (ti, field, value) => {
        setTeams((prev) => {
            const updated = [...prev];
            updated[ti] = { ...updated[ti], pools: { ...updated[ti].pools, [field]: value } };
            return updated;
        });
    };

    const addToBar = (emp) => {
        if (isAssigned(emp.uid)) return;
        setBarTeam((prev) => ({ ...prev, members: [...prev.members, { uid: emp.uid, name: emp.username, role: "bartender" }] }));
    };
    const removeFromBar = (uid) => setBarTeam((prev) => ({ ...prev, members: prev.members.filter((m) => m.uid !== uid) }));
    const updateBarPool = (field, value) => setBarTeam((prev) => ({ ...prev, pools: { ...prev.pools, [field]: value } }));

    const addRunner = (emp) => {
        if (isAssigned(emp.uid)) return;
        setRunners((prev) => [...prev, { uid: emp.uid, name: emp.username, role: "runner" }]);
    };
    const removeRunner = (uid) => setRunners((prev) => prev.filter((m) => m.uid !== uid));

    // ── Calculate ──
    const handleCalculate = () => {
        // Sum pools across teams + bar for total inputs to engine
        const totalTips = teams.reduce((s, t) => s + (Number(t.pools.tips) || 0), 0)
            + (Number(barTeam.pools.tips) || 0);
        const totalGratuity = teams.reduce((s, t) => s + (Number(t.pools.gratuity) || 0), 0)
            + (Number(barTeam.pools.gratuity) || 0);
        const totalCash = teams.reduce((s, t) => s + (Number(t.pools.cash) || 0), 0)
            + (Number(barTeam.pools.cash) || 0);

        const result = calculateDistribution({
            restaurantTeams: teams,
            barTeam: barTeam.members,
            runners,
            totalTips,
            totalGratuity,
            totalCash,
            wineAmount: Number(wineAmount) || 0,
            liquorAmount: Number(liquorAmount) || 0,
            isContract,
            contractGratAmount: Number(contractGratAmount) || 0,
        });

        setPayouts(result.payouts);
        setSummary(result.summary);
        setActiveTab("payouts");
    };

    // ── Save ──
    const handleSave = async () => {
        setSaveStatus("Saving...");
        try {
            // Save shift config to Firestore
            await setDoc(doc(db, "shifts", date), {
                date,
                teams,
                barTeam,
                runners,
                isContract,
                contractGratAmount: Number(contractGratAmount) || 0,
                wineAmount: Number(wineAmount) || 0,
                liquorAmount: Number(liquorAmount) || 0,
                payouts,
                summary,
                updatedAt: new Date().toISOString(),
            });

            // Write each employee's payout to their tip data
            if (payouts) {
                const saves = Object.entries(payouts).map(([uid, payout]) =>
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

            setSaveStatus("✅ Shift saved!");
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
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Modal header */}
                <div className={styles.modalHeader}>
                    <div>
                        <h2 className={styles.modalTitle}>Shift — {date}</h2>
                        {saveStatus && <span className={styles.saveStatus}>{saveStatus}</span>}
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    {["setup", "pools", "payouts"].map((t) => (
                        <button
                            key={t}
                            className={`${styles.tab} ${activeTab === t ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab(t)}
                        >
                            {t === "setup" ? "1. Team Setup" : t === "pools" ? "2. Pool Inputs" : "3. Payouts"}
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
                                <div className={styles.contractRow}>
                                    <label className={styles.label}>Contract Shift</label>
                                    <input type="checkbox" checked={isContract} onChange={(e) => setIsContract(e.target.checked)} />
                                    {isContract && (
                                        <input
                                            type="number"
                                            className={styles.inlineInput}
                                            placeholder="26% Grat Amount"
                                            value={contractGratAmount}
                                            onChange={(e) => setContractGratAmount(e.target.value)}
                                        />
                                    )}
                                </div>

                                {teams.map((team, ti) => (
                                    <div key={team.teamId} className={styles.teamBlock}>
                                        <h3 className={styles.teamTitle}>Restaurant Team {ti + 1}</h3>
                                        <MemberList members={team.members} onRemove={(uid) => removeFromTeam(ti, uid)} />
                                        <AddEmployeeRow
                                            employees={allEmployees.filter((e) => !isAssigned(e.uid))}
                                            roles={RESTAURANT_ROLES}
                                            onAdd={(emp, role) => addToTeam(ti, emp, role)}
                                        />
                                    </div>
                                ))}

                                <div className={styles.teamBlock}>
                                    <h3 className={styles.teamTitle}>Bar Team</h3>
                                    <MemberList members={barTeam.members} onRemove={removeFromBar} />
                                    <AddEmployeeRow
                                        employees={allEmployees.filter((e) => !isAssigned(e.uid))}
                                        roles={["bartender"]}
                                        onAdd={(emp) => addToBar(emp)}
                                    />
                                </div>

                                <div className={styles.teamBlock}>
                                    <h3 className={styles.teamTitle}>Runners (${RUNNER_FLAT_RATE} flat each)</h3>
                                    <MemberList members={runners} onRemove={removeRunner} />
                                    <AddEmployeeRow
                                        employees={allEmployees.filter((e) => !isAssigned(e.uid))}
                                        roles={["runner"]}
                                        onAdd={(emp) => addRunner(emp)}
                                    />
                                </div>

                                <button className={styles.nextBtn} onClick={() => setActiveTab("pools")}>
                                    Next: Pool Inputs →
                                </button>
                            </div>
                        )}

                        {/* ── Tab 2: Pool Inputs (per team) ── */}
                        {activeTab === "pools" && (
                            <div>
                                {isContract && contractGratAmount && (
                                    <div className={styles.contractInfo}>
                                        <span>Contract 18% to pool: <strong>{fmt(Number(contractGratAmount) * 0.18)}</strong></span>
                                        <span>Remaining 82%: <strong>{fmt(Number(contractGratAmount) * 0.82)}</strong></span>
                                    </div>
                                )}

                                {/* Per-team pool inputs */}
                                {teams.map((team, ti) => (
                                    <div key={team.teamId} className={styles.teamBlock}>
                                        <h3 className={styles.teamTitle}>
                                            Restaurant Team {ti + 1}
                                            <span className={styles.memberCount}> ({team.members.length} members)</span>
                                        </h3>
                                        <div className={styles.poolRow}>
                                            <PoolField label="Tips" value={team.pools.tips} onChange={(v) => updateTeamPool(ti, "tips", v)} />
                                            <PoolField label="Gratuity" value={team.pools.gratuity} onChange={(v) => updateTeamPool(ti, "gratuity", v)} />
                                            <PoolField label="Cash" value={team.pools.cash} onChange={(v) => updateTeamPool(ti, "cash", v)} />
                                        </div>
                                    </div>
                                ))}

                                <div className={styles.teamBlock}>
                                    <h3 className={styles.teamTitle}>
                                        Bar Team
                                        <span className={styles.memberCount}> ({barTeam.members.length} members)</span>
                                    </h3>
                                    <div className={styles.poolRow}>
                                        <PoolField label="Tips" value={barTeam.pools.tips} onChange={(v) => updateBarPool("tips", v)} />
                                        <PoolField label="Gratuity" value={barTeam.pools.gratuity} onChange={(v) => updateBarPool("gratuity", v)} />
                                        <PoolField label="Cash" value={barTeam.pools.cash} onChange={(v) => updateBarPool("cash", v)} />
                                    </div>
                                </div>

                                {/* Wine & Liquor */}
                                <div className={styles.teamBlock}>
                                    <h3 className={styles.teamTitle}>Additional</h3>
                                    <div className={styles.poolRow}>
                                        <PoolField label="Wine Sales ($)" value={wineAmount} onChange={setWineAmount} hint="1% → Captains" />
                                        <PoolField label="Liquor Sales ($)" value={liquorAmount} onChange={setLiquorAmount} hint="Tracked – TBD" />
                                    </div>
                                </div>

                                {/* Totals summary */}
                                <div className={styles.totalSummary}>
                                    <span>Total Tips: <strong>{fmt(totalPoolTips)}</strong></span>
                                    <span>Total Grat: <strong>{fmt(totalPoolGrat)}</strong></span>
                                    <span>Total Cash: <strong>{fmt(totalPoolCash)}</strong></span>
                                </div>

                                <button className={styles.nextBtn} onClick={handleCalculate}>
                                    Calculate Payouts →
                                </button>
                            </div>
                        )}

                        {/* ── Tab 3: Payouts ── */}
                        {activeTab === "payouts" && (
                            <div>
                                {!payouts ? (
                                    <p className={styles.hint}>Go to Pool Inputs and calculate first.</p>
                                ) : (
                                    <>
                                        {summary && (
                                            <div className={styles.summaryBar}>
                                                <span>Runners: <strong>{fmt(summary.runnerCostTotal)}</strong></span>
                                                <span>Wine bonus: <strong>{fmt(summary.wineBonusTotal)}</strong></span>
                                                {summary.isContract && (
                                                    <span>Contract pool share: <strong>{fmt(summary.contractPoolShare)}</strong></span>
                                                )}
                                            </div>
                                        )}

                                        <table className={styles.payoutTable}>
                                            <thead>
                                                <tr>
                                                    <th>Employee</th>
                                                    <th>Role</th>
                                                    <th>Tips</th>
                                                    <th>Gratuity</th>
                                                    <th>Cash</th>
                                                    <th>Wine+</th>
                                                    <th>Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(payouts).map(([uid, p]) => (
                                                    <tr key={uid}>
                                                        <td>{p.name}</td>
                                                        <td className={styles.roleCell}>{ROLE_LABELS[p.role] ?? p.role}</td>
                                                        <td>{fmt(p.tips)}</td>
                                                        <td>{fmt(p.gratuity)}</td>
                                                        <td>{fmt(p.cash)}</td>
                                                        <td>{p.wineBonus > 0 ? fmt(p.wineBonus) : "—"}</td>
                                                        <td className={styles.totalCell}>{fmt(p.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <div className={styles.saveRow}>
                                            <button className={styles.saveBtn} onClick={handleSave}>
                                                Confirm & Save Shift
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MemberList({ members, onRemove }) {
    if (!members.length) return <p className={styles.emptyMsg}>No members added yet.</p>;
    return (
        <div className={styles.memberList}>
            {members.map((m) => (
                <div key={m.uid} className={styles.memberTag}>
                    <span>{m.name} — {ROLE_LABELS[m.role] ?? m.role}</span>
                    <button className={styles.removeBtn} onClick={() => onRemove(m.uid)}>✕</button>
                </div>
            ))}
        </div>
    );
}

function AddEmployeeRow({ employees, roles, onAdd }) {
    const [selectedUid, setSelectedUid] = useState("");
    const [selectedRole, setSelectedRole] = useState(roles[0]);

    const handleAdd = () => {
        const emp = employees.find((e) => e.uid === selectedUid);
        if (!emp) return;
        onAdd(emp, selectedRole);
        setSelectedUid("");
    };

    return (
        <div className={styles.addRow}>
            <select className={styles.select} value={selectedUid} onChange={(e) => setSelectedUid(e.target.value)}>
                <option value="">— Select employee —</option>
                {employees.map((e) => (
                    <option key={e.uid} value={e.uid}>{e.username}</option>
                ))}
            </select>
            {roles.length > 1 && (
                <select className={styles.select} value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                    {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
            )}
            <button className={styles.addBtn} onClick={handleAdd} disabled={!selectedUid}>+ Add</button>
        </div>
    );
}

function PoolField({ label, value, onChange, hint }) {
    return (
        <div className={styles.poolField}>
            <label className={styles.label}>{label}</label>
            {hint && <span className={styles.hint}>{hint}</span>}
            <input
                type="number"
                min="0"
                step="0.01"
                className={styles.input}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="0.00"
            />
        </div>
    );
}

export default AdminDashboard;
