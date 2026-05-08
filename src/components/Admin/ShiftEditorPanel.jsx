import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import styles from "./AdminDashboard.module.css";
import { db } from "../../config/firebase";
import { calculateShift } from "../../utils/engine";
import ShiftSetupDnd from "./ShiftSetup/ShiftSetupDnd";

const toMoney = (value) => Number(value) || 0;
const hasNegative = (value) => Number(value) < 0;

function validateShiftInputs({ teams, barTeam, runners }) {
    const errors = [];
    const assignedCount = teams.reduce((sum, team) => sum + team.members.length, 0)
        + barTeam.members.length
        + runners.length;

    if (assignedCount === 0) {
        errors.push("Assign at least one employee before saving the shift.");
    }

    let enteredMoney = 0;

    teams.forEach((team, index) => {
        const label = `Team ${index + 1}`;
        const pools = team.pools || {};
        ["sales", "tips", "gratuity", "cash"].forEach((field) => {
            if (hasNegative(pools[field])) errors.push(`${label} ${field} cannot be negative.`);
            enteredMoney += toMoney(pools[field]);
        });

        (team.contracts || []).forEach((contract, contractIndex) => {
            if (contract.gratuity === "" || contract.gratuity === null || contract.gratuity === undefined) {
                errors.push(`${label} contract #${contractIndex + 1} needs a gratuity amount or should be removed.`);
            }
            if (hasNegative(contract.gratuity)) {
                errors.push(`${label} contract #${contractIndex + 1} cannot be negative.`);
            }
            enteredMoney += toMoney(contract.gratuity);
        });
    });

    const barPools = barTeam.pools || {};
    ["sales", "tips", "gratuity", "runners"].forEach((field) => {
        if (hasNegative(barPools[field])) errors.push(`Bar ${field} cannot be negative.`);
        enteredMoney += toMoney(barPools[field]);
    });

    runners.forEach((runner) => {
        if (hasNegative(runner.payoutAmount)) {
            errors.push(`Runner ${runner.name || "Unknown"} payout cannot be negative.`);
        }
    });

    if (enteredMoney <= 0) {
        errors.push("Enter at least one sales, tip, gratuity, cash, contract, or bar amount before saving.");
    }

    return errors;
}

function ShiftEditorPanel({ date, allEmployees, onClose }) {
    const [activeTab, setActiveTab] = useState("setup");
    const [teams, setTeams] = useState([
        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
    const [runners, setRunners] = useState([]);
    const [saveStatus, setSaveStatus] = useState("");
    const [validationMessages, setValidationMessages] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);

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
                }
            } catch (e) {
                console.error("Failed to load shift:", e);
            } finally {
                setLoading(false);
            }
        };
        loadShift();
    }, [date]);

    const handleCalculateAndSave = async () => {
        if (isSaving) return;

        const inputErrors = validateShiftInputs({ teams, barTeam, runners });
        if (inputErrors.length > 0) {
            setValidationMessages(inputErrors);
            setSaveStatus("Fix the highlighted items before saving.");
            setActiveTab("pools");
            return;
        }

        setIsSaving(true);
        setValidationMessages([]);
        setSaveStatus("Calculating...");

        const result = calculateShift({ teams, barTeam, runners });

        if (result.validations?.length > 0 || Math.abs(result.balances?.overallBalance || 0) > 0.05) {
            setValidationMessages(result.validations?.length > 0
                ? result.validations
                : [`Shift does not balance. Difference: $${(Number(result.balances?.overallBalance) || 0).toFixed(2)}`]
            );
            setSaveStatus("Calculation needs review before saving.");
            setIsSaving(false);
            setActiveTab("pools");
            return;
        }

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
            attachToMapped(result.payouts.roleGrouped.assistants, 'assistant');
            attachToMapped(result.payouts.roleGrouped.bar, 'bartender');
            attachToMapped(result.payouts.roleGrouped.runners, 'runner');
        }

        const payoutCount = Object.keys(mappedPayoutsForFirebase).length;

        if (payoutCount === 0) {
            setIsSaving(false);
            setValidationMessages(["Assign at least one employee before saving the shift."]);
            setSaveStatus("⚠️ Cannot save shift: No employees are assigned to this shift.");
            setTimeout(() => setSaveStatus(""), 4000);
            return;
        }

        setSaveStatus("Saving...");
        try {
            await setDoc(doc(db, "shifts", date), {
                date,
                teams,
                barTeam,
                runners,
                payouts: mappedPayoutsForFirebase,
                summary: result,
                updatedAt: new Date().toISOString(),
            });

            const saves = Object.entries(mappedPayoutsForFirebase).map(([uid, payout]) =>
                setDoc(doc(db, "users", uid, "tips", date), {
                    gratuity: payout.gratuity,
                    tip: payout.tips,
                    cash: payout.cash,
                    wineBonus: payout.wineBonus,
                    points: payout.points || 0,
                    total: payout.total,
                    role: payout.role,
                    shiftDate: date,
                    updatedAt: new Date().toISOString(),
                }, { merge: true })
            );
            await Promise.all(saves);
            setSaveStatus("✅ Saved!");

            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (e) {
            console.error(e);
            setSaveStatus("❌ Failed to save.");
            setValidationMessages(["The shift could not be saved. Please try again."]);
            setIsSaving(false);
        }
    };

    return (
        <div className={styles.editorPanel}>
            <div className={styles.editorHeader}>
                <div>
                    <h2 className={styles.editorTitle}>Shift — {date}</h2>
                    {saveStatus && <span className={styles.saveStatus}>{saveStatus}</span>}
                </div>
            </div>

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

                    {activeTab === "pools" && (
                        <div>
                            {validationMessages.length > 0 && (
                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '0.85rem 1rem', borderRadius: '8px', margin: '0 auto 1rem', maxWidth: '800px' }}>
                                    <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '0.4rem' }}>Review before saving</div>
                                    <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                        {validationMessages.map((message, index) => (
                                            <li key={`${message}-${index}`}>{message}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className={styles.poolsLayout} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', width: '100%', maxWidth: '800px', margin: '0 auto 2rem' }}>
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
                                        </div>

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
                                <button className={styles.saveBtn} onClick={handleCalculateAndSave} disabled={isSaving}>
                                    {isSaving ? "Saving..." : "Calculate & Save Shift ✓"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

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
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder="0.00"
                aria-label={label}
            />
        </div>
    );
}

export default ShiftEditorPanel;
