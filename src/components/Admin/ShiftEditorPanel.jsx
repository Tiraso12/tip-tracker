import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import styles from "./AdminDashboard.module.css";
import { db } from "../../config/firebase";
import { calculateShift } from "../../utils/engine";
import ShiftSetupDnd from "./ShiftSetup/ShiftSetupDnd";

const toMoney = (value) => Number(value) || 0;
const hasNegative = (value) => Number(value) < 0;
const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtMoney = (value) => moneyFormatter.format(toMoney(value));
const roleLabels = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

function getContractTotal(team) {
    return (team.contracts || []).reduce((sum, contract) => sum + toMoney(contract.gratuity), 0);
}

function getTeamSummary(team) {
    const pools = team.pools || {};
    const contractTotal = getContractTotal(team);
    const tips = toMoney(pools.tips);
    const gratuity = toMoney(pools.gratuity);
    const cash = toMoney(pools.cash);

    return {
        sales: toMoney(pools.sales),
        tips,
        gratuity,
        cash,
        covers: toMoney(pools.covers),
        contractTotal,
        payoutPool: tips + gratuity + cash + contractTotal,
    };
}

function getBarSummary(barTeam) {
    const pools = barTeam.pools || {};
    const tips = toMoney(pools.tips);
    const gratuity = toMoney(pools.gratuity);

    return {
        sales: toMoney(pools.sales),
        tips,
        gratuity,
        covers: toMoney(pools.covers),
        runnerTransfer: toMoney(pools.runners),
        payoutPool: tips + gratuity,
    };
}

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

function mapPayoutsForFirebase(result) {
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

    return mappedPayoutsForFirebase;
}

function buildPayoutReview(result, mappedPayouts) {
    const payoutRows = Object.entries(mappedPayouts)
        .map(([uid, payout]) => ({ uid, ...payout }))
        .sort((a, b) => {
            const roleOrder = ["captain", "server", "back", "assistant", "bartender", "runner"];
            const roleDiff = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
            if (roleDiff !== 0) return roleDiff;
            return (a.name || "").localeCompare(b.name || "");
        });

    const roleTotals = payoutRows.reduce((totals, payout) => {
        const role = payout.role || "other";
        totals[role] = (totals[role] || 0) + toMoney(payout.total);
        return totals;
    }, {});

    return {
        result,
        mappedPayouts,
        payoutRows,
        roleTotals,
        staffTotal: payoutRows.reduce((sum, payout) => sum + toMoney(payout.total), 0),
    };
}

function ShiftEditorPanel({ date, allEmployees, onClose }) {
    const [teams, setTeams] = useState([
        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
    const [runners, setRunners] = useState([]);
    const [saveStatus, setSaveStatus] = useState("");
    const [validationMessages, setValidationMessages] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [calculatedReview, setCalculatedReview] = useState(null);

    const poolSummary = useMemo(() => {
        const teamSummaries = teams.map(getTeamSummary);
        const barSummary = getBarSummary(barTeam);
        const restaurantPoints = teams.reduce((sum, team) => (
            sum + team.members.reduce((memberSum, member) => memberSum + toMoney(member.points), 0)
        ), 0);
        const barPoints = barTeam.members.reduce((sum, member) => (
            sum + (member.points === null || member.points === undefined || member.points === "" ? 1 : toMoney(member.points))
        ), 0);

        const restaurantSales = teamSummaries.reduce((sum, team) => sum + team.sales, 0);
        const restaurantTips = teamSummaries.reduce((sum, team) => sum + team.tips, 0);
        const restaurantGratuity = teamSummaries.reduce((sum, team) => sum + team.gratuity + team.contractTotal, 0);
        const restaurantCash = teamSummaries.reduce((sum, team) => sum + team.cash, 0);
        const restaurantCovers = teamSummaries.reduce((sum, team) => sum + team.covers, 0);
        const contractTotal = teamSummaries.reduce((sum, team) => sum + team.contractTotal, 0);

        return {
            teams: teamSummaries,
            bar: barSummary,
            restaurantSales,
            totalSales: restaurantSales + barSummary.sales,
            totalTips: restaurantTips + barSummary.tips,
            totalGratuity: restaurantGratuity + barSummary.gratuity,
            totalCash: restaurantCash,
            totalCovers: restaurantCovers + barSummary.covers,
            contractTotal,
            runnerTransfer: barSummary.runnerTransfer,
            totalRunnerPay: runners.reduce((sum, runner) => sum + toMoney(runner.payoutAmount || 102), 0),
            payoutPool: restaurantTips + barSummary.tips + restaurantGratuity + barSummary.gratuity + restaurantCash,
            restaurantPoints,
            barPoints,
        };
    }, [teams, barTeam, runners]);

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

    const updateRunnerPayout = (uid, value) => {
        setRunners(prev => prev.map(runner =>
            runner.uid === uid ? { ...runner, payoutAmount: value } : runner
        ));
    };

    const updateTeamMemberPoints = (teamId, uid, value) => {
        setTeams(prev => prev.map(team =>
            team.teamId === teamId
                ? {
                    ...team,
                    members: team.members.map(member =>
                        member.uid === uid ? { ...member, points: value } : member
                    )
                }
                : team
        ));
    };

    const adjustTeamMemberPoints = (teamId, uid, delta) => {
        setTeams(prev => prev.map(team =>
            team.teamId === teamId
                ? {
                    ...team,
                    members: team.members.map(member => {
                        if (member.uid !== uid) return member;
                        const current = toMoney(member.points);
                        return { ...member, points: Math.max(0, current + delta) };
                    })
                }
                : team
        ));
    };

    const updateBarMemberPoints = (uid, value) => {
        setBarTeam(prev => ({
            ...prev,
            members: prev.members.map(member =>
                member.uid === uid ? { ...member, points: value } : member
            )
        }));
    };

    const adjustBarMemberPoints = (uid, delta) => {
        setBarTeam(prev => ({
            ...prev,
            members: prev.members.map(member => {
                if (member.uid !== uid) return member;
                const current = member.points === null || member.points === undefined || member.points === ""
                    ? 1
                    : toMoney(member.points);
                return { ...member, points: Math.max(0, current + delta) };
            })
        }));
    };

    useEffect(() => {
        setCalculatedReview(null);
    }, [teams, barTeam, runners, date]);

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

    const handleCalculateForReview = () => {
        if (isSaving) return;

        const inputErrors = validateShiftInputs({ teams, barTeam, runners });
        if (inputErrors.length > 0) {
            setValidationMessages(inputErrors);
            setSaveStatus("Fix the highlighted items before saving.");
            return;
        }

        setValidationMessages([]);
        setSaveStatus("Calculating payouts...");

        const result = calculateShift({ teams, barTeam, runners });

        if (result.validations?.length > 0 || Math.abs(result.balances?.overallBalance || 0) > 0.05) {
            setValidationMessages(result.validations?.length > 0
                ? result.validations
                : [`Shift does not balance. Difference: $${(Number(result.balances?.overallBalance) || 0).toFixed(2)}`]
            );
            setSaveStatus("Calculation needs review before saving.");
            setCalculatedReview(null);
            return;
        }

        const mappedPayoutsForFirebase = mapPayoutsForFirebase(result);

        const payoutCount = Object.keys(mappedPayoutsForFirebase).length;

        if (payoutCount === 0) {
            setValidationMessages(["Assign at least one employee before saving the shift."]);
            setSaveStatus("⚠️ Cannot save shift: No employees are assigned to this shift.");
            setTimeout(() => setSaveStatus(""), 4000);
            return;
        }

        setCalculatedReview(buildPayoutReview(result, mappedPayoutsForFirebase));
        setSaveStatus("Review calculated payouts before saving.");
    };

    const handleConfirmSave = async () => {
        if (isSaving || !calculatedReview) return;

        const mappedPayoutsForFirebase = calculatedReview.mappedPayouts;
        const result = calculatedReview.result;

        setIsSaving(true);
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
            setCalculatedReview(null);

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
                    <h2 className={styles.editorTitle}>Shift Workspace — {date}</h2>
                    {saveStatus && <span className={styles.saveStatus}>{saveStatus}</span>}
                </div>
                <div className={styles.editorActions}>
                    <button
                        type="button"
                        className={styles.printSetupBtn}
                        onClick={() => window.print()}
                    >
                        Print Team Sheet
                    </button>
                </div>
            </div>

            {loading ? (
                <div className={styles.loadingMsg}>Loading shift data...</div>
            ) : (
                <div className={styles.modalBody}>
                    <div className={styles.shiftWorkspace}>
                        <section className={styles.workspaceSection}>
                            <div className={styles.workspaceSectionHeader}>
                                <div>
                                    <div className={styles.poolSummaryEyebrow}>Opening setup</div>
                                    <h3 className={styles.workspaceSectionTitle}>Team Floor Setup</h3>
                                </div>
                                <div className={styles.poolSummaryMeta}>
                                    {teams.reduce((sum, team) => sum + team.members.length, 0)} dining room
                                    {" / "}
                                    {barTeam.members.length} bar
                                    {" / "}
                                    {runners.length} runners
                                </div>
                            </div>
                            <ShiftSetupDnd
                                allEmployees={allEmployees}
                                teams={teams} setTeams={setTeams}
                                barTeam={barTeam} setBarTeam={setBarTeam}
                                runners={runners} setRunners={setRunners}
                            />
                        </section>

                        <section className={styles.workspaceSection}>
                            <div className={styles.workspaceSectionHeader}>
                                <div>
                                    <div className={styles.poolSummaryEyebrow}>End of shift</div>
                                    <h3 className={styles.workspaceSectionTitle}>Money Closeout</h3>
                                </div>
                            </div>

                            {validationMessages.length > 0 && (
                                <div className={styles.validationPanel}>
                                    <div className={styles.validationTitle}>Review before saving</div>
                                    <ul className={styles.validationList}>
                                        {validationMessages.map((message, index) => (
                                            <li key={`${message}-${index}`}>{message}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className={styles.poolSummaryPanel}>
                                <div className={styles.poolSummaryHeader}>
                                    <div>
                                        <div className={styles.poolSummaryEyebrow}>Live shift totals</div>
                                        <div className={styles.poolSummaryTitle}>{fmtMoney(poolSummary.payoutPool)}</div>
                                    </div>
                                    <div className={styles.poolSummaryMeta}>
                                        {teams.reduce((sum, team) => sum + team.members.length, 0)} dining room
                                        {" / "}
                                        {barTeam.members.length} bar
                                        {" / "}
                                        {runners.length} runners
                                    </div>
                                </div>

                                <div className={styles.poolSummaryGrid}>
                                    <SummaryMetric label="Sales" value={fmtMoney(poolSummary.totalSales)} />
                                    <SummaryMetric label="Tips CTP" value={fmtMoney(poolSummary.totalTips)} />
                                    <SummaryMetric label="Gratuity" value={fmtMoney(poolSummary.totalGratuity)} />
                                    <SummaryMetric label="Cash" value={fmtMoney(poolSummary.totalCash)} />
                                    <SummaryMetric label="Covers" value={poolSummary.totalCovers.toLocaleString()} />
                                    <SummaryMetric label="Runner pay" value={fmtMoney(poolSummary.totalRunnerPay)} />
                                    <SummaryMetric label="Bar transfer" value={fmtMoney(poolSummary.runnerTransfer)} />
                                    <SummaryMetric label="Dining pts" value={poolSummary.restaurantPoints.toLocaleString()} />
                                    <SummaryMetric label="Bar pts" value={poolSummary.barPoints.toLocaleString()} />
                                </div>

                                {poolSummary.contractTotal > 0 && (
                                    <div className={styles.poolSummaryNote}>
                                        Contract gratuity included: {fmtMoney(poolSummary.contractTotal)}
                                    </div>
                                )}
                            </div>

                            <div className={styles.poolsLayout}>
                                {teams.map((t, idx) => (
                                    <div key={t.teamId} className={styles.poolCard}>
                                        <div className={styles.poolCardHeader}>
                                            <span className={styles.poolCardTitle}>Team {idx + 1} ({t.members.length} members)</span>
                                        </div>
                                        <PoolCardTotals
                                            totals={[
                                                ["Sales", poolSummary.teams[idx].sales],
                                                ["Pool", poolSummary.teams[idx].payoutPool],
                                                ["Covers", poolSummary.teams[idx].covers],
                                            ]}
                                        />
                                        <div className={styles.poolFieldGrid}>
                                            <PoolField label="Sales ($)" value={t.pools.sales} onChange={(v) => updatePool(t.teamId, "sales", v)} />
                                            <PoolField label="Tips (CTP) ($)" value={t.pools.tips} onChange={(v) => updatePool(t.teamId, "tips", v)} />
                                            <PoolField label="Gratuity ($)" value={t.pools.gratuity} onChange={(v) => updatePool(t.teamId, "gratuity", v)} />
                                            <PoolField label="Cash ($)" value={t.pools.cash} onChange={(v) => updatePool(t.teamId, "cash", v)} />
                                            <PoolField label="Covers" value={t.pools.covers} onChange={(v) => updatePool(t.teamId, "covers", v)} />
                                        </div>

                                        <div className={styles.contractPanel}>
                                            <div className={`${styles.contractHeader} ${t._showContracts ? styles.contractHeaderOpen : ""}`}>
                                                <button
                                                    type="button"
                                                    className={styles.contractToggleButton}
                                                    onClick={() => {
                                                        setTeams(prev => prev.map(pt => pt.teamId === t.teamId ? { ...pt, _showContracts: !pt._showContracts } : pt));
                                                    }}
                                                    aria-expanded={Boolean(t._showContracts)}
                                                >
                                                    <span className={`${styles.contractChevron} ${t._showContracts ? styles.contractChevronOpen : ""}`}>▶</span>
                                                    Contracts {t.contracts && t.contracts.length > 0 ? `(${t.contracts.length})` : ''}
                                                </button>

                                                {t._showContracts && (
                                                    <button
                                                        type="button"
                                                        className={styles.addContractButton}
                                                        onClick={() => addContract(t.teamId)}
                                                    >
                                                        + Add Contract
                                                    </button>
                                                )}
                                            </div>

                                            {t._showContracts && (
                                                t.contracts && t.contracts.length > 0 ? (
                                                    <div className={styles.contractList}>
                                                        {t.contracts.map((contract, cIdx) => (
                                                            <div key={cIdx} className={styles.contractItem}>
                                                                <span className={styles.contractIndex}>#{cIdx + 1}</span>
                                                                <div className={styles.contractAmountCell}>
                                                                    <div className={styles.contractCurrencyInput}>
                                                                        <span className={styles.contractCurrencyPrefix}>$</span>
                                                                        <input
                                                                            type="number"
                                                                            min="0" step="0.01"
                                                                            placeholder="26% Gratuity Amount"
                                                                            value={contract.gratuity}
                                                                            onChange={(e) => updateContract(t.teamId, cIdx, "gratuity", e.target.value)}
                                                                            className={`${styles.contractAmountInput} ${styles.noSpinners}`}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className={styles.removeContractButton}
                                                                    onClick={() => removeContract(t.teamId, cIdx)}
                                                                    title="Remove Contract"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className={styles.contractEmpty}>
                                                        No contracts added. Click '+ Add Contract' to input a contract amount.
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <div className={styles.poolCard}>
                                    <div className={styles.poolCardHeader}>
                                        <span className={styles.poolCardTitle}>Bar Team ({barTeam.members.length} members)</span>
                                    </div>
                                    <PoolCardTotals
                                        totals={[
                                            ["Sales", poolSummary.bar.sales],
                                            ["Pool", poolSummary.bar.payoutPool],
                                            ["Transfer", poolSummary.bar.runnerTransfer],
                                        ]}
                                    />
                                    <div className={styles.poolFieldGrid}>
                                        <PoolField label="Bar Sales ($)" value={barTeam.pools.sales} onChange={(v) => updateBarPool("sales", v)} />
                                        <PoolField label="Tips (CTP) ($)" value={barTeam.pools.tips} onChange={(v) => updateBarPool("tips", v)} />
                                        <PoolField label="Gratuity ($)" value={barTeam.pools.gratuity} onChange={(v) => updateBarPool("gratuity", v)} />
                                        <PoolField label="Covers" value={barTeam.pools.covers} onChange={(v) => updateBarPool("covers", v)} />
                                        <PoolField label="Runners Transfer ($)" value={barTeam.pools.runners} onChange={(v) => updateBarPool("runners", v)} />
                                    </div>
                                </div>
                            </div>

                            <PointAdjustmentsPanel
                                teams={teams}
                                barTeam={barTeam}
                                totals={{
                                    restaurant: poolSummary.restaurantPoints,
                                    bar: poolSummary.barPoints,
                                }}
                                onTeamPointChange={updateTeamMemberPoints}
                                onTeamPointAdjust={adjustTeamMemberPoints}
                                onBarPointChange={updateBarMemberPoints}
                                onBarPointAdjust={adjustBarMemberPoints}
                            />

                            <div className={styles.runnerReviewPanel}>
                                <div className={styles.poolCardHeader}>
                                    <span className={styles.poolCardTitle}>Runner Payout Review ({runners.length})</span>
                                    <strong className={styles.runnerReviewTotal}>{fmtMoney(poolSummary.totalRunnerPay)}</strong>
                                </div>

                                {runners.length === 0 ? (
                                    <div className={styles.runnerReviewEmpty}>No runners assigned to this shift.</div>
                                ) : (
                                    <div className={styles.runnerReviewList}>
                                        {runners.map((runner) => (
                                            <div key={runner.uid} className={styles.runnerReviewRow}>
                                                <span className={styles.runnerReviewName}>{runner.name}</span>
                                                <label className={styles.runnerReviewInputWrap}>
                                                    <span>Payout</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        className={`${styles.input} ${styles.noSpinners}`}
                                                        value={runner.payoutAmount ?? ""}
                                                        onChange={(e) => updateRunnerPayout(runner.uid, e.target.value)}
                                                        placeholder="102.00"
                                                        aria-label={`${runner.name} runner payout`}
                                                    />
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {calculatedReview && (
                                <CalculatedPayoutReview review={calculatedReview} />
                            )}

                            <div className={styles.saveRow}>
                                {saveStatus && <span className={styles.saveStatus}>{saveStatus}</span>}
                                {calculatedReview && (
                                    <button
                                        className={styles.nextBtn}
                                        onClick={handleCalculateForReview}
                                        disabled={isSaving}
                                    >
                                        Recalculate Payouts
                                    </button>
                                )}
                                <button
                                    className={styles.saveBtn}
                                    onClick={calculatedReview ? handleConfirmSave : handleCalculateForReview}
                                    disabled={isSaving}
                                >
                                    {isSaving
                                        ? "Saving..."
                                        : calculatedReview
                                            ? "Confirm & Save Shift ✓"
                                            : "Calculate Payouts"}
                                </button>
                            </div>
                        </section>
                    </div>

                    <PrintableTeamSheet
                        date={date}
                        teams={teams}
                        barTeam={barTeam}
                        runners={runners}
                    />
                </div>
            )}
        </div>
    );
}

function PrintableTeamSheet({ date, teams, barTeam, runners }) {
    const diningCount = teams.reduce((sum, team) => sum + team.members.length, 0);
    const totalCount = diningCount + barTeam.members.length + runners.length;

    return (
        <section className={styles.printSheet} aria-hidden="true">
            <div className={styles.printSheetHeader}>
                <div>
                    <div className={styles.printSheetEyebrow}>Tip Tracker</div>
                    <h1>Team Setup</h1>
                </div>
                <div className={styles.printSheetDate}>
                    <span>Date</span>
                    <strong>{date}</strong>
                </div>
            </div>

            <div className={styles.printSheetSummary}>
                <span>{diningCount} dining room</span>
                <span>{barTeam.members.length} bar</span>
                <span>{runners.length} runners</span>
                <span>{totalCount} total</span>
            </div>

            <div className={styles.printTeamGrid}>
                {teams.map((team, index) => (
                    <PrintTeamBlock
                        key={team.teamId}
                        title={`Team ${index + 1}`}
                        members={team.members}
                        emptyMessage="No team assigned"
                    />
                ))}
                <PrintTeamBlock
                    title="Bar Team"
                    members={barTeam.members}
                    emptyMessage="No bar team assigned"
                />
                <PrintTeamBlock
                    title="Runners"
                    members={runners}
                    emptyMessage="No runners assigned"
                    isRunner
                />
            </div>
        </section>
    );
}

function PrintTeamBlock({ title, members, emptyMessage, isRunner }) {
    return (
        <div className={styles.printTeamBlock}>
            <div className={styles.printTeamTitle}>
                <h2>{title}</h2>
                <span>{members.length}</span>
            </div>
            {members.length === 0 ? (
                <div className={styles.printEmpty}>{emptyMessage}</div>
            ) : (
                <ul className={styles.printMemberList}>
                    {members.map((member) => (
                        <li key={member.uid}>
                            <strong>{member.name}</strong>
                            <span>
                                {isRunner
                                    ? "Runner"
                                    : roleLabels[member.role] || member.role || "Staff"}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function CalculatedPayoutReview({ review }) {
    const { result, payoutRows, roleTotals, staffTotal } = review;
    const reviewRoleLabels = {
        captain: "Captains",
        server: "Servers",
        back: "Backs",
        assistant: "Assistants",
        bartender: "Bar",
        runner: "Runners",
    };

    return (
        <div className={styles.calculatedReviewPanel}>
            <div className={styles.calculatedReviewHeader}>
                <div>
                    <div className={styles.poolSummaryEyebrow}>Calculated payout review</div>
                    <div className={styles.calculatedReviewTitle}>{fmtMoney(staffTotal)}</div>
                </div>
                <div className={styles.calculatedReviewBalance}>
                    <span>Balance</span>
                    <strong>{fmtMoney(result.balances?.overallBalance)}</strong>
                </div>
            </div>

            <div className={styles.calculatedReviewGrid}>
                <SummaryMetric label="Employees" value={payoutRows.length.toLocaleString()} />
                <SummaryMetric label="Available" value={fmtMoney(result.balances?.totalAvailable)} />
                <SummaryMetric label="Distributed" value={fmtMoney(result.balances?.totalDistributed)} />
                <SummaryMetric label="Runner pay" value={fmtMoney(result.allocations?.totalRunnerPay)} />
            </div>

            <div className={styles.roleTotalList}>
                {Object.entries(reviewRoleLabels).map(([role, label]) => (
                    <div key={role}>
                        <span>{label}</span>
                        <strong>{fmtMoney(roleTotals[role] || 0)}</strong>
                    </div>
                ))}
            </div>

            <div className={styles.payoutPreviewList}>
                {payoutRows.map((payout) => (
                    <div key={payout.uid} className={styles.payoutPreviewRow}>
                        <div>
                            <strong>{payout.name}</strong>
                            <span>{reviewRoleLabels[payout.role] || payout.role}</span>
                        </div>
                        <div className={styles.payoutPreviewAmounts}>
                            <span>CTP {fmtMoney(payout.tips)}</span>
                            <span>GRT {fmtMoney(payout.gratuity)}</span>
                            <span>Cash {fmtMoney(payout.cash)}</span>
                            <strong>{fmtMoney(payout.total)}</strong>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PointAdjustmentsPanel({
    teams,
    barTeam,
    totals,
    onTeamPointChange,
    onTeamPointAdjust,
    onBarPointChange,
    onBarPointAdjust,
}) {
    const restaurantMembersCount = teams.reduce((sum, team) => sum + team.members.length, 0);
    const hasPointAdjustments = restaurantMembersCount > 0 || barTeam.members.length > 0;

    return (
        <div className={styles.pointReviewPanel}>
            <div className={styles.poolCardHeader}>
                <span className={styles.poolCardTitle}>Point Adjustments</span>
                <div className={styles.pointTotals}>
                    <span>Dining {totals.restaurant.toLocaleString()}</span>
                    <span>Bar {totals.bar.toLocaleString()}</span>
                </div>
            </div>

            {!hasPointAdjustments ? (
                <div className={styles.runnerReviewEmpty}>Assign restaurant or bar employees before adjusting points.</div>
            ) : (
                <div className={styles.pointReviewGroups}>
                    {teams.map((team, index) => (
                        <PointGroup
                            key={team.teamId}
                            title={`Team ${index + 1}`}
                            members={team.members}
                            emptyMessage="No dining room employees on this team."
                            onPointChange={(uid, value) => onTeamPointChange(team.teamId, uid, value)}
                            onPointAdjust={(uid, delta) => onTeamPointAdjust(team.teamId, uid, delta)}
                        />
                    ))}

                    <PointGroup
                        title="Bar Team"
                        members={barTeam.members}
                        emptyMessage="No bar employees assigned."
                        defaultPoints={1}
                        onPointChange={onBarPointChange}
                        onPointAdjust={onBarPointAdjust}
                    />
                </div>
            )}
        </div>
    );
}

function PointGroup({ title, members, emptyMessage, defaultPoints = 0, onPointChange, onPointAdjust }) {
    return (
        <div className={styles.pointGroup}>
            <div className={styles.pointGroupTitle}>
                <span>{title}</span>
                <strong>{members.reduce((sum, member) => {
                    const points = member.points === null || member.points === undefined || member.points === ""
                        ? defaultPoints
                        : toMoney(member.points);
                    return sum + points;
                }, 0).toLocaleString()} pts</strong>
            </div>

            {members.length === 0 ? (
                <div className={styles.pointGroupEmpty}>{emptyMessage}</div>
            ) : (
                <div className={styles.pointRows}>
                    {members.map((member) => {
                        const value = member.points === null || member.points === undefined || member.points === ""
                            ? defaultPoints
                            : member.points;
                        return (
                            <div key={member.uid} className={styles.pointRow}>
                                <div className={styles.pointMember}>
                                    <strong>{member.name}</strong>
                                    <span>{roleLabels[member.role] || member.role || "Staff"}</span>
                                </div>
                                <div className={styles.pointControls}>
                                    <button
                                        type="button"
                                        className={styles.pointStepButton}
                                        onClick={() => onPointAdjust(member.uid, -0.5)}
                                        aria-label={`Decrease ${member.name} points`}
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        className={`${styles.input} ${styles.noSpinners} ${styles.pointInput}`}
                                        value={value}
                                        onChange={(e) => onPointChange(member.uid, e.target.value)}
                                        aria-label={`${member.name} points`}
                                    />
                                    <button
                                        type="button"
                                        className={styles.pointStepButton}
                                        onClick={() => onPointAdjust(member.uid, 0.5)}
                                        aria-label={`Increase ${member.name} points`}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function SummaryMetric({ label, value }) {
    return (
        <div className={styles.summaryMetric}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function PoolCardTotals({ totals }) {
    return (
        <div className={styles.poolCardTotals}>
            {totals.map(([label, value]) => (
                <div key={label}>
                    <span>{label}</span>
                    <strong>{label === "Covers" ? value.toLocaleString() : fmtMoney(value)}</strong>
                </div>
            ))}
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
