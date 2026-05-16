import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { calculateShift } from "../../utils/engine";
import ShiftSetupDnd from "./ShiftSetup/ShiftSetupDnd";
import { Button, Card } from "../ui";

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

const NUMERIC_INPUT =
    "block w-full h-9 px-2.5 text-sm font-mono tabular-nums bg-[var(--color-surface)] " +
    "text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] " +
    "border border-[var(--color-line)] rounded-[var(--radius-xs)] " +
    "transition-colors duration-150 hover:border-[var(--color-line-strong)] " +
    "focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 " +
    "appearance-none [-moz-appearance:textfield] " +
    "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function PoolField({ label, value, onChange, hint }) {
    const id = `pool-field-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                {label}
            </label>
            {hint ? <span className="text-[10px] text-[var(--color-ink-muted)]">{hint}</span> : null}
            <input
                id={id}
                type="number"
                min="0"
                step="0.01"
                className={NUMERIC_INPUT}
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder="0.00"
                aria-label={label}
            />
        </div>
    );
}

function SummaryMetric({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                {label}
            </span>
            <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                {value}
            </strong>
        </div>
    );
}

function PoolCardTotals({ totals }) {
    return (
        <div className="grid grid-cols-3 gap-3 px-4 py-3 bg-[var(--color-surface-muted)]/50 border-y border-[var(--color-line)]">
            {totals.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                        {label}
                    </span>
                    <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                        {label === "Covers" ? value.toLocaleString() : fmtMoney(value)}
                    </strong>
                </div>
            ))}
        </div>
    );
}

function PointGroup({ title, members, emptyMessage, defaultPoints = 0, onPointChange, onPointAdjust }) {
    const totalPoints = members.reduce((sum, member) => {
        const points = member.points === null || member.points === undefined || member.points === ""
            ? defaultPoints
            : toMoney(member.points);
        return sum + points;
    }, 0);

    return (
        <div className="border border-[var(--color-line)] rounded-[var(--radius-sm)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-muted)]/40 border-b border-[var(--color-line)]">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                    {title}
                </span>
                <strong className="text-xs font-mono tabular-nums text-[var(--color-ink)]">
                    {totalPoints.toLocaleString()} pts
                </strong>
            </div>

            {members.length === 0 ? (
                <div className="px-4 py-3 text-xs text-[var(--color-ink-muted)] italic">
                    {emptyMessage}
                </div>
            ) : (
                <div className="divide-y divide-[var(--color-line)]">
                    {members.map((member) => {
                        const value = member.points === null || member.points === undefined || member.points === ""
                            ? defaultPoints
                            : member.points;
                        return (
                            <div key={member.uid} className="flex items-center justify-between gap-3 px-4 py-2">
                                <div className="flex flex-col min-w-0">
                                    <strong className="text-sm text-[var(--color-ink)] truncate">{member.name}</strong>
                                    <span className="text-[11px] text-[var(--color-ink-muted)]">
                                        {roleLabels[member.role] || member.role || "Staff"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => onPointAdjust(member.uid, -0.5)}
                                        aria-label={`Decrease ${member.name} points`}
                                        className="h-7 w-7 inline-flex items-center justify-center rounded-[var(--radius-xs)] border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors"
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        className={NUMERIC_INPUT + " !w-16 !h-7 text-center"}
                                        value={value}
                                        onChange={(e) => onPointChange(member.uid, e.target.value)}
                                        aria-label={`${member.name} points`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onPointAdjust(member.uid, 0.5)}
                                        aria-label={`Increase ${member.name} points`}
                                        className="h-7 w-7 inline-flex items-center justify-center rounded-[var(--radius-xs)] border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors"
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
        <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line)]">
                <span className="text-sm font-medium text-[var(--color-ink)]">Point Adjustments</span>
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                    <span>Dining {totals.restaurant.toLocaleString()}</span>
                    <span>Bar {totals.bar.toLocaleString()}</span>
                </div>
            </div>

            {!hasPointAdjustments ? (
                <div className="px-4 py-6 text-xs text-[var(--color-ink-muted)] italic">
                    Assign restaurant or bar employees before adjusting points.
                </div>
            ) : (
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
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
        <div className="border border-[var(--color-accent)]/20 rounded-[var(--radius-md)] bg-[var(--color-accent-soft)]/40">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-[var(--color-accent)]/20">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        Calculated payout review
                    </div>
                    <div className="font-display text-2xl font-medium tracking-tight tabular-nums text-[var(--color-accent)]">
                        {fmtMoney(staffTotal)}
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">Balance</span>
                    <strong className="font-mono tabular-nums text-[var(--color-ink)]">
                        {fmtMoney(result.balances?.overallBalance)}
                    </strong>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-[var(--color-accent)]/15">
                <SummaryMetric label="Employees" value={payoutRows.length.toLocaleString()} />
                <SummaryMetric label="Available" value={fmtMoney(result.balances?.totalAvailable)} />
                <SummaryMetric label="Distributed" value={fmtMoney(result.balances?.totalDistributed)} />
                <SummaryMetric label="Runner pay" value={fmtMoney(result.allocations?.totalRunnerPay)} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-5 py-4 border-b border-[var(--color-accent)]/15">
                {Object.entries(reviewRoleLabels).map(([role, label]) => (
                    <div key={role} className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</span>
                        <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                            {fmtMoney(roleTotals[role] || 0)}
                        </strong>
                    </div>
                ))}
            </div>

            <div className="divide-y divide-[var(--color-accent)]/10 max-h-96 overflow-y-auto">
                {payoutRows.map((payout) => (
                    <div key={payout.uid} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-3">
                        <div className="flex flex-col">
                            <strong className="text-sm text-[var(--color-ink)]">{payout.name}</strong>
                            <span className="text-[11px] text-[var(--color-ink-muted)]">
                                {reviewRoleLabels[payout.role] || payout.role}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                            <span>CTP {fmtMoney(payout.tips)}</span>
                            <span>GRT {fmtMoney(payout.gratuity)}</span>
                            <span>Cash {fmtMoney(payout.cash)}</span>
                            <strong className="text-sm text-[var(--color-ink)]">{fmtMoney(payout.total)}</strong>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PrintTeamBlock({ title, members, emptyMessage, isRunner }) {
    return (
        <div className="break-inside-avoid border border-black/40 p-3 mb-3">
            <div className="flex items-center justify-between border-b border-black/30 pb-1 mb-2">
                <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
                <span className="text-xs">{members.length}</span>
            </div>
            {members.length === 0 ? (
                <div className="text-xs italic text-black/60">{emptyMessage}</div>
            ) : (
                <ul className="space-y-1 text-xs">
                    {members.map((member) => (
                        <li key={member.uid} className="flex items-center justify-between gap-3 border-b border-dashed border-black/20 pb-1">
                            <strong>{member.name}</strong>
                            <span className="text-black/70">
                                {isRunner ? "Runner" : roleLabels[member.role] || member.role || "Staff"}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function PrintableTeamSheet({ date, teams, barTeam, runners }) {
    const diningCount = teams.reduce((sum, team) => sum + team.members.length, 0);
    const totalCount = diningCount + barTeam.members.length + runners.length;

    return (
        <section
            aria-hidden="true"
            className="hidden print:block fixed inset-0 bg-white text-black p-6 font-sans"
            style={{ zIndex: 9999 }}
        >
            <div className="flex items-end justify-between border-b-2 border-black pb-2 mb-4">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.2em]">Tip Tracker</div>
                    <h1 className="font-display text-3xl font-bold mt-1">Team Setup</h1>
                </div>
                <div className="text-right">
                    <span className="block text-[10px] uppercase tracking-wide">Date</span>
                    <strong className="font-mono text-lg">{date}</strong>
                </div>
            </div>

            <div className="flex justify-between text-xs font-medium mb-4">
                <span>{diningCount} dining room</span>
                <span>{barTeam.members.length} bar</span>
                <span>{runners.length} runners</span>
                <span>{totalCount} total</span>
            </div>

            <div className="columns-2 gap-4">
                {teams.map((team, index) => (
                    <PrintTeamBlock
                        key={team.teamId}
                        title={`Team ${index + 1}`}
                        members={team.members}
                        emptyMessage="No team assigned"
                    />
                ))}
                <PrintTeamBlock title="Bar Team" members={barTeam.members} emptyMessage="No bar team assigned" />
                <PrintTeamBlock title="Runners" members={runners} emptyMessage="No runners assigned" isRunner />
            </div>
        </section>
    );
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
        setSaveStatus("Calculating payouts…");

        const result = calculateShift({ teams, barTeam, runners });

        if (result.validations?.length > 0) {
            setValidationMessages(result.validations);
            setSaveStatus("Review warnings and calculated payouts before saving.");
        } else {
            setValidationMessages([]);
            setSaveStatus("Review calculated payouts before saving.");
        }

        const mappedPayoutsForFirebase = mapPayoutsForFirebase(result);
        const payoutCount = Object.keys(mappedPayoutsForFirebase).length;

        if (payoutCount === 0) {
            setValidationMessages(["Assign at least one employee before saving the shift."]);
            setSaveStatus("Cannot save shift: no employees are assigned.");
            setTimeout(() => setSaveStatus(""), 4000);
            return;
        }

        setCalculatedReview(buildPayoutReview(result, mappedPayoutsForFirebase));
    };

    const handleConfirmSave = async () => {
        if (isSaving || !calculatedReview) return;

        const mappedPayoutsForFirebase = calculatedReview.mappedPayouts;
        const result = calculatedReview.result;

        setIsSaving(true);
        setSaveStatus("Saving…");
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
            setSaveStatus("Saved.");
            setCalculatedReview(null);

            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (e) {
            console.error(e);
            setSaveStatus("Failed to save.");
            setValidationMessages(["The shift could not be saved. Please try again."]);
            setIsSaving(false);
        }
    };

    const diningCount = teams.reduce((sum, team) => sum + team.members.length, 0);

    return (
        <div className="space-y-6 print:hidden">
            {/* Workspace header */}
            <Card className="!p-0">
                <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-[var(--color-line)]">
                    <div className="flex flex-col gap-1">
                        <h2 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                            Shift Workspace — {date}
                        </h2>
                        {saveStatus ? (
                            <span className="text-xs text-[var(--color-ink-soft)]">{saveStatus}</span>
                        ) : null}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => window.print()}>
                        Print Team Sheet
                    </Button>
                </header>

                {loading ? (
                    <div className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
                        Loading shift data…
                    </div>
                ) : (
                    <div className="px-6 py-6 space-y-8">
                        {/* Team setup */}
                        <section className="space-y-3">
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                        Opening setup
                                    </div>
                                    <h3 className="font-display text-xl font-medium tracking-tight text-[var(--color-ink)]">
                                        Team Floor Setup
                                    </h3>
                                </div>
                                <div className="text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                                    {diningCount} dining · {barTeam.members.length} bar · {runners.length} runners
                                </div>
                            </div>
                            <ShiftSetupDnd
                                allEmployees={allEmployees}
                                teams={teams} setTeams={setTeams}
                                barTeam={barTeam} setBarTeam={setBarTeam}
                                runners={runners} setRunners={setRunners}
                            />
                        </section>

                        {/* Money closeout */}
                        <section className="space-y-4">
                            <div>
                                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                    End of shift
                                </div>
                                <h3 className="font-display text-xl font-medium tracking-tight text-[var(--color-ink)]">
                                    Money Closeout
                                </h3>
                            </div>

                            {validationMessages.length > 0 ? (
                                <div className="px-4 py-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-[var(--radius-sm)]">
                                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-danger)] mb-1">
                                        Review before saving
                                    </div>
                                    <ul className="list-disc pl-5 text-sm text-[var(--color-ink)] space-y-0.5">
                                        {validationMessages.map((message, index) => (
                                            <li key={`${message}-${index}`}>{message}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {/* Live totals */}
                            <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)]">
                                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-5 py-4 border-b border-[var(--color-line)]">
                                    <div>
                                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                            Live shift totals
                                        </div>
                                        <div className="font-display text-2xl font-medium tracking-tight tabular-nums text-[var(--color-ink)]">
                                            {fmtMoney(poolSummary.payoutPool)}
                                        </div>
                                    </div>
                                    <div className="text-xs font-mono tabular-nums text-[var(--color-ink-soft)]">
                                        {diningCount} dining · {barTeam.members.length} bar · {runners.length} runners
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 px-5 py-4">
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

                                {poolSummary.contractTotal > 0 ? (
                                    <div className="px-5 py-2 text-xs text-[var(--color-ink-soft)] bg-[var(--color-surface-muted)]/50 border-t border-[var(--color-line)]">
                                        Contract gratuity included: {fmtMoney(poolSummary.contractTotal)}
                                    </div>
                                ) : null}
                            </div>

                            {/* Pool inputs */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {teams.map((t, idx) => (
                                    <div key={t.teamId} className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden">
                                        <div className="px-4 py-3 border-b border-[var(--color-line)]">
                                            <span className="text-sm font-medium text-[var(--color-ink)]">
                                                Team {idx + 1} ({t.members.length} members)
                                            </span>
                                        </div>
                                        <PoolCardTotals
                                            totals={[
                                                ["Sales", poolSummary.teams[idx].sales],
                                                ["Pool", poolSummary.teams[idx].payoutPool],
                                                ["Covers", poolSummary.teams[idx].covers],
                                            ]}
                                        />
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
                                            <PoolField label="Sales ($)" value={t.pools.sales} onChange={(v) => updatePool(t.teamId, "sales", v)} />
                                            <PoolField label="Tips (CTP) ($)" value={t.pools.tips} onChange={(v) => updatePool(t.teamId, "tips", v)} />
                                            <PoolField label="Gratuity ($)" value={t.pools.gratuity} onChange={(v) => updatePool(t.teamId, "gratuity", v)} />
                                            <PoolField label="Cash ($)" value={t.pools.cash} onChange={(v) => updatePool(t.teamId, "cash", v)} />
                                            <PoolField label="Covers" value={t.pools.covers} onChange={(v) => updatePool(t.teamId, "covers", v)} />
                                        </div>

                                        {/* Contracts */}
                                        <div className="border-t border-[var(--color-line)]">
                                            <div className="flex items-center justify-between px-4 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setTeams(prev => prev.map(pt => pt.teamId === t.teamId ? { ...pt, _showContracts: !pt._showContracts } : pt));
                                                    }}
                                                    aria-expanded={Boolean(t._showContracts)}
                                                    className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors"
                                                >
                                                    <span className={"transition-transform duration-150 " + (t._showContracts ? "rotate-90" : "")}>▶</span>
                                                    Contracts {t.contracts && t.contracts.length > 0 ? `(${t.contracts.length})` : ""}
                                                </button>
                                                {t._showContracts ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => addContract(t.teamId)}
                                                        className="text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
                                                    >
                                                        + Add Contract
                                                    </button>
                                                ) : null}
                                            </div>

                                            {t._showContracts ? (
                                                t.contracts && t.contracts.length > 0 ? (
                                                    <div className="px-4 pb-4 space-y-2">
                                                        {t.contracts.map((contract, cIdx) => (
                                                            <div key={cIdx} className="flex items-center gap-2">
                                                                <span className="text-xs font-mono tabular-nums text-[var(--color-ink-muted)] w-7">
                                                                    #{cIdx + 1}
                                                                </span>
                                                                <div className="relative flex-1">
                                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-ink-muted)] pointer-events-none">$</span>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        placeholder="26% Gratuity Amount"
                                                                        value={contract.gratuity}
                                                                        onChange={(e) => updateContract(t.teamId, cIdx, "gratuity", e.target.value)}
                                                                        className={NUMERIC_INPUT + " !pl-6"}
                                                                    />
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeContract(t.teamId, cIdx)}
                                                                    title="Remove contract"
                                                                    aria-label="Remove contract"
                                                                    className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="px-4 pb-4 text-xs text-[var(--color-ink-muted)] italic">
                                                        No contracts added. Click '+ Add Contract' to input a contract amount.
                                                    </div>
                                                )
                                            ) : null}
                                        </div>
                                    </div>
                                ))}

                                {/* Bar */}
                                <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden">
                                    <div className="px-4 py-3 border-b border-[var(--color-line)]">
                                        <span className="text-sm font-medium text-[var(--color-ink)]">
                                            Bar Team ({barTeam.members.length} members)
                                        </span>
                                    </div>
                                    <PoolCardTotals
                                        totals={[
                                            ["Sales", poolSummary.bar.sales],
                                            ["Pool", poolSummary.bar.payoutPool],
                                            ["Transfer", poolSummary.bar.runnerTransfer],
                                        ]}
                                    />
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
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
                                totals={{ restaurant: poolSummary.restaurantPoints, bar: poolSummary.barPoints }}
                                onTeamPointChange={updateTeamMemberPoints}
                                onTeamPointAdjust={adjustTeamMemberPoints}
                                onBarPointChange={updateBarMemberPoints}
                                onBarPointAdjust={adjustBarMemberPoints}
                            />

                            {/* Runner review */}
                            <div className="border border-[var(--color-line)] rounded-[var(--radius-md)] bg-[var(--color-surface)]">
                                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line)]">
                                    <span className="text-sm font-medium text-[var(--color-ink)]">
                                        Runner Payout Review ({runners.length})
                                    </span>
                                    <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                                        {fmtMoney(poolSummary.totalRunnerPay)}
                                    </strong>
                                </div>

                                {runners.length === 0 ? (
                                    <div className="px-4 py-6 text-xs text-[var(--color-ink-muted)] italic">
                                        No runners assigned to this shift.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-[var(--color-line)]">
                                        {runners.map((runner) => (
                                            <div key={runner.uid} className="flex items-center justify-between gap-3 px-4 py-3">
                                                <span className="text-sm text-[var(--color-ink)] truncate">{runner.name}</span>
                                                <label className="flex items-center gap-2">
                                                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                                                        Payout
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        className={NUMERIC_INPUT + " !w-28"}
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

                            {calculatedReview ? <CalculatedPayoutReview review={calculatedReview} /> : null}

                            {/* Save row */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
                                {saveStatus ? (
                                    <span className="text-xs text-[var(--color-ink-soft)]">{saveStatus}</span>
                                ) : null}
                                {calculatedReview ? (
                                    <Button
                                        variant="secondary"
                                        onClick={handleCalculateForReview}
                                        disabled={isSaving}
                                    >
                                        Recalculate Payouts
                                    </Button>
                                ) : null}
                                <Button
                                    onClick={calculatedReview ? handleConfirmSave : handleCalculateForReview}
                                    disabled={isSaving}
                                >
                                    {isSaving
                                        ? "Saving…"
                                        : calculatedReview
                                            ? "Confirm & Save Shift"
                                            : "Calculate Payouts"}
                                </Button>
                            </div>
                        </section>
                    </div>
                )}
            </Card>

            <PrintableTeamSheet
                date={date}
                teams={teams}
                barTeam={barTeam}
                runners={runners}
            />
        </div>
    );
}

export default ShiftEditorPanel;
