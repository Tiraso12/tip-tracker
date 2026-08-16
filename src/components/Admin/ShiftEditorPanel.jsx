import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { calculateShift } from "../../utils/engine";
import DayRail from "./DayRail";
import { getRailSteps } from "../../utils/dayFlow";
import { getGroupMoneyStatus, summarizeGroupStatuses } from "../../utils/settleStatus";
import { Card } from "../ui";
import { saveClosedShiftAtomically } from "../../utils/closeoutPersistence";
import { buildShiftSetupDraft } from "../../utils/shiftPersistence";
import { RUNNER_FLAT_RATE } from "../../utils/constants";
import { getHistoryFlagUpdate, getShiftParticipantUids } from "../../utils/userHistoryFlags";
import { useAuth } from "../../context/AuthContext";
import { usePendingActions } from "../../context/PendingActionsContext";
import {
    applyBarFoodSalesEdit,
    buildPayoutReview,
    fmtAmount,
    getBarSummary,
    getTeamSummary,
    ignoreMissingUserDoc,
    mapPayoutsForFirebase,
    toMoney,
    validateShiftInputs,
    validateTeamSetup,
} from "./shiftEditorUtils";
import { applyOpenShiftMemberNames } from "../../utils/accountProfilePersistence";
import { describeShiftBalance } from "../../utils/shiftBalance";
import { describeSaveFailure, findNamelessParticipants } from "../../utils/saveFailure";
import { FloorStep } from "./ShiftEditor/FloorStep";
import { ReviewStep } from "./ShiftEditor/ReviewStep";
import { SettleStep } from "./ShiftEditor/SettleStep";

// A stable fingerprint of the editable shift (roster + money), ignoring transient
// UI-only fields like `_showContracts`. Comparing the live fingerprint to the one
// captured at load tells us whether the admin has actually changed anything - used
// to decide whether leaving edit mode needs a discard confirmation.
function fingerprintShift(teams, barTeam, runners) {
    return JSON.stringify({
        teams: (teams || []).map(team => ({
            teamId: team.teamId,
            members: team.members || [],
            pools: team.pools || {},
            contracts: team.contracts || [],
        })),
        barTeam: { members: barTeam?.members || [], pools: barTeam?.pools || {} },
        runners: runners || [],
    });
}

// The one discard prompt for leaving the editor with unsaved work. It is shared by
// the in-screen Cancel and by navigation that leaves from outside the editor (the
// home control, the workspace menu), so every exit warns identically.
const DISCARD_EDIT_CONFIRMATION =
    "Discard your changes to this closed shift?\n\n" +
    "Edits to a paid-out shift are only saved when you go to Review and " +
    "Confirm & Save Shift. Leaving now returns to the saved shift and keeps its " +
    "current payouts unchanged.";

function ShiftEditorPanel({ date, allEmployees, onClose, initialStep = "floor", onRegisterLeaveGuard }) {
    const { user } = useAuth();
    const { beginPendingAction } = usePendingActions();
    const [teams, setTeams] = useState([
        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
    const [runners, setRunners] = useState([]);
    const [saveStatus, setSaveStatus] = useState("");
    const [validationMessages, setValidationMessages] = useState([]);
    // What came back from a refused Confirm & Save, in captain-facing wording. Its own
    // state rather than `validationMessages`, which Review deliberately suppresses -
    // that suppression is why the failure reason used to reach nobody.
    const [saveFailure, setSaveFailure] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasLoadedShift, setHasLoadedShift] = useState(false);
    const [shiftStatus, setShiftStatus] = useState(null);
    // Day-step spine (shared by both flow shells): "floor" -> "settle" -> "review".
    // The old two-accordion editor is retired; each step is its own focused screen.
    const [step, setStep] = useState(["settle", "review"].includes(initialStep) ? initialStep : "floor");
    const [activeGroupId, setActiveGroupId] = useState("team-1");
    // Settle up lands LOCKED: the money form is visible but its fields are disabled
    // until the admin taps the floating Edit. Done/Cancel re-lock in place (they do
    // not leave the settle screen). The group switcher stays tappable while locked.
    const [settleEditable, setSettleEditable] = useState(false);
    const [draftStatus, setDraftStatus] = useState("");
    // Fingerprint of the shift as loaded, so Cancel can tell an untouched view from
    // one with real edits and only confirm a discard when work would actually be lost.
    const loadedFingerprintRef = useRef("");
    // Snapshot of the money taken when Settle up is unlocked, so Cancel can revert to
    // exactly what was showing before this edit and truly discard the changes.
    const settleSnapshotRef = useRef(null);
    const realEmployeeUids = useMemo(
        () => new Set((allEmployees || []).map(employee => employee.uid).filter(Boolean)),
        [allEmployees]
    );

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
            totalRunnerPay: runners.reduce((sum, runner) => sum + toMoney(runner.payoutAmount || RUNNER_FLAT_RATE), 0),
            payoutPool: restaurantTips + barSummary.tips + restaurantGratuity + barSummary.gratuity,
            restaurantPoints,
            barPoints,
        };
    }, [teams, barTeam, runners]);

    // Descriptors for the switcher rail + entry panel: one entry per dining team, then Bar,
    // then Runners. Each carries the display name, roster sub-line, live pool, and whether
    // any money has been entered (drives the status dot / check).
    const closeoutGroups = useMemo(() => {
        const teamGroups = teams.map((team, index) => {
            const pool = poolSummary.teams[index]?.payoutPool ?? 0;
            const hasPeople = team.members.length > 0;
            // "Other input" = non-pool money/context (Sales/Cash/Covers). The pool
            // itself (Tips + Gratuity + contract gratuity) is what funds payouts.
            const hasOtherInput = toMoney(team.pools?.sales) > 0
                || toMoney(team.pools?.cash) > 0
                || toMoney(team.pools?.covers) > 0;
            return {
                id: team.teamId,
                kind: "dining",
                name: `Team ${index + 1}`,
                // No "· dining" tag: a numbered Team IS the dining room, so the word only
                // restated the pill you just tapped. The bar group keeps its tag - there
                // the pool really is a different one, and that distinction earns a word.
                sub: `${team.members.length} ${team.members.length === 1 ? "member" : "members"}`,
                poolLabel: "Pool",
                pool,
                hasPeople,
                status: getGroupMoneyStatus({ pool, hasOtherInput, hasPeople }),
                teamIndex: index,
            };
        });
        const barPool = poolSummary.bar.payoutPool;
        const barHasPeople = barTeam.members.length > 0;
        const barHasOtherInput = toMoney(barTeam.pools?.sales) > 0
            || toMoney(barTeam.pools?.covers) > 0
            || toMoney(barTeam.pools?.foodSales) > 0;
        const runnerPool = poolSummary.totalRunnerPay;
        return [
            ...teamGroups,
            {
                id: "bar",
                kind: "bar",
                name: "Bar Team",
                sub: `${barTeam.members.length} ${barTeam.members.length === 1 ? "member" : "members"} · bar`,
                poolLabel: "Pool",
                pool: barPool,
                hasPeople: barHasPeople,
                status: getGroupMoneyStatus({ pool: barPool, hasOtherInput: barHasOtherInput, hasPeople: barHasPeople }),
            },
            {
                id: "runners",
                kind: "runners",
                name: "Runners",
                sub: `${runners.length} ${runners.length === 1 ? "runner" : "runners"}`,
                poolLabel: "Pay",
                pool: runnerPool,
                hasPeople: runners.length > 0,
                status: getGroupMoneyStatus({ pool: runnerPool, hasOtherInput: false, hasPeople: runners.length > 0 }),
            },
        ];
    }, [teams, barTeam, runners, poolSummary]);

    const groupStatusSummary = summarizeGroupStatuses(closeoutGroups);
    // The count that sits beside the Pool figure counts only the groups that figure is
    // made of. `payoutPool` is dining CTP + GRT + bar CTP + bar GRT; runner pay is not in
    // it and never was - it is a deduction off the top, which is why the Runners pill is
    // labelled "Pay" and not "Pool". Counting Runners there put a group in the headline
    // that contributes nothing to the money printed next to it, so "5 groups · Pool $X"
    // described five groups with four groups' money. This changes the COUNT only; the
    // figure itself is untouched.
    const poolGroupSummary = summarizeGroupStatuses(
        closeoutGroups.filter(group => group.kind !== "runners"),
    );

    // Review's rung 2: every group's money exactly as it was typed at Settle up, all on
    // one screen. Settle up itself shows one group at a time, so this is the only place
    // the whole entry can be scanned for a typo in a single read.
    //
    // Runners are deliberately NOT here. Money you entered means money that FUNDS the
    // pool; runner pay is drawn OUT of that pool (engine.js subtracts `totalRunnerPay`
    // from the raw team CTP pool before the point split). Listing it alongside CTP and
    // GRT read as if runner pay added to the pool, overstating what there is to split.
    // Runner pay now appears in Shift totals as the deduction it is, and the runners
    // themselves stay in "Who's on the floor".
    const reviewMoneyGroups = useMemo(() => {
        const moneyEntry = (label, value) => ({
            label,
            value: fmtAmount(value),
            empty: toMoney(value) === 0,
        });
        const teamGroups = teams.map((team, index) => {
            const pools = team.pools || {};
            const contracts = (team.contracts || []).filter(contract => toMoney(contract.gratuity) > 0);
            return {
                id: team.teamId,
                name: `Team ${index + 1}`,
                poolLabel: "pool",
                pool: poolSummary.teams[index]?.payoutPool ?? 0,
                entries: [
                    moneyEntry("CTP", pools.tips),
                    moneyEntry("GRT", pools.gratuity),
                    moneyEntry("Cash", pools.cash),
                    moneyEntry("Sales", pools.sales),
                    ...contracts.map((contract, contractIndex) => (
                        moneyEntry(`Contract ${contract.name || contractIndex + 1}`, contract.gratuity)
                    )),
                ],
            };
        });
        return [
            ...teamGroups,
            {
                id: "bar",
                name: "Bar Team",
                poolLabel: "pool",
                pool: poolSummary.bar.payoutPool,
                entries: [
                    moneyEntry("CTP", barTeam.pools?.tips),
                    moneyEntry("GRT", barTeam.pools?.gratuity),
                    moneyEntry("Sales", barTeam.pools?.sales),
                    // Food sales funds nothing - it is what the fee below is derived
                    // from - but it belongs in a row whose whole job is "every number
                    // you typed, on one screen": a fee that looks wrong is checked
                    // against the figure it came from, and hiding that figure would
                    // send the check to the wrong place.
                    moneyEntry("Food sales", barTeam.pools?.foodSales),
                    // The bar's "Runners Fee" field (`pools.runners`). Despite the name
                    // this is NOT runner pay - that is the flat per-runner amount, which
                    // leaves the pool entirely and lives in Shift totals. This is a MOVE
                    // between the two sides: engine.js adds it to the dining CTP pool and
                    // takes the same amount off the bar CTP pool, so it changes who splits
                    // the money without changing how much there is. Keep this label in
                    // step with the PoolField on the Bar entry screen - the captain scans
                    // this row against the field they typed, so the two must read alike.
                    moneyEntry("Runners fee", barTeam.pools?.runners),
                ],
            },
        ];
    }, [teams, barTeam, poolSummary]);

    // Review's rung 3: the floor as it stands, for spotting someone who should not be on.
    const reviewFloorGroups = useMemo(() => {
        const memberNames = (members) => members.map(member => member.name || "Unknown");
        return [
            ...teams.map((team, index) => ({
                id: team.teamId,
                kind: "dining",
                name: `Team ${index + 1}`,
                members: memberNames(team.members),
                points: team.members.reduce((sum, member) => sum + toMoney(member.points), 0),
            })),
            {
                id: "bar",
                kind: "bar",
                name: "Bar Team",
                members: memberNames(barTeam.members),
                points: poolSummary.barPoints,
            },
            {
                id: "runners",
                kind: "runners",
                name: "Runners",
                members: memberNames(runners),
                points: 0,
                // Runners split no points - they are paid a flat amount off the pool - so
                // their meta carries that pay instead. It is the only place on Review the
                // per-group runner figure appears now that it is out of "Money you entered",
                // and here it reads as what it is: money leaving the pool, not funding it.
                pay: poolSummary.totalRunnerPay,
            },
        ];
    }, [teams, barTeam, runners, poolSummary.barPoints, poolSummary.totalRunnerPay]);

    // THE payout calculation, derived from the CURRENT floor plan and money on every
    // render rather than captured by a button press. That is the whole point: the old
    // model stored a snapshot in state and nulled it on any edit, so adding one person
    // on the Floor plan made Review unreachable until you walked back to Settle up and
    // pressed Calculate Payouts again. Recalculation now follows the data.
    //
    // `calculateShift` is pure - it reads the inputs and returns a result, writing
    // nothing - so deriving it costs nothing but the arithmetic and cannot persist a
    // half-finished shift. Confirm & Save is still the only thing that writes.
    //
    // The guard that matters: when the inputs cannot produce a complete calculation
    // this returns `ready: false` with the reasons, and Review renders those reasons
    // instead of a confident wrong total. Review NEVER shows a partially-derived
    // number as if it were final.
    const liveReview = useMemo(() => {
        if (!hasLoadedShift) return { ready: false, blockers: [], warnings: [] };

        const blockers = validateShiftInputs({ teams, barTeam, runners });
        if (blockers.length > 0) return { ready: false, blockers, warnings: [] };

        const result = calculateShift({ teams, barTeam, runners });
        const mappedPayouts = mapPayoutsForFirebase(result);
        if (Object.keys(mappedPayouts).length === 0) {
            return {
                ready: false,
                blockers: ["Assign at least one employee before payouts can be calculated."],
                warnings: [],
            };
        }

        return {
            ready: true,
            blockers: [],
            // Engine warnings (a shift that does not balance, a negative runner payout).
            // Not blockers - the numbers are complete - but the captain must see them
            // before committing, so Review surfaces them in Shift totals.
            warnings: result.validations || [],
            ...buildPayoutReview(result, mappedPayouts),
        };
    }, [hasLoadedShift, teams, barTeam, runners]);

    // The one rule that blocks a save on a complete calculation. Derived on every
    // render alongside `liveReview` so Review can withhold the save BEFORE the press
    // instead of reporting it afterwards - `saveClosedShiftAtomically` re-runs the
    // same check and throws, so anything this reports blocked would have failed.
    const balanceReport = useMemo(() => (
        liveReview.ready ? describeShiftBalance({ result: liveReview.result, teams, barTeam }) : null
    ), [barTeam, liveReview, teams]);
    const saveBlocked = Boolean(balanceReport && !balanceReport.balanced);

    // A failure describes the shift as it was when it was refused. Any edit to the
    // roster or the money makes that description stale, so it goes.
    useEffect(() => {
        setSaveFailure(null);
    }, [teams, barTeam, runners]);

    const hasAssignedStaff = useMemo(() => (
        teams.some(team => team.members.length > 0) || barTeam.members.length > 0 || runners.length > 0
    ), [barTeam.members.length, runners.length, teams]);

    const hasCloseoutDraftData = useMemo(() => (
        teams.some(team => (
            Object.values(team.pools || {}).some(value => toMoney(value) > 0)
            || (team.contracts || []).some(contract => toMoney(contract.gratuity) > 0)
        ))
        || Object.values(barTeam.pools || {}).some(value => toMoney(value) > 0)
        || runners.some(runner => toMoney(runner.payoutAmount) !== RUNNER_FLAT_RATE)
    ), [barTeam.pools, runners, teams]);

    const updatePool = useCallback((teamId, field, value) => {
        setTeams(prev => prev.map(t =>
            t.teamId === teamId ? { ...t, pools: { ...t.pools, [field]: value } } : t
        ));
    }, []);

    const addContract = useCallback((teamId) => {
        setTeams(prev => prev.map(t =>
            t.teamId === teamId ? { ...t, contracts: [...(t.contracts || []), { name: "", gratuity: "" }] } : t
        ));
    }, []);

    const updateContract = useCallback((teamId, index, field, value) => {
        setTeams(prev => prev.map(t => {
            if (t.teamId === teamId) {
                const newContracts = [...(t.contracts || [])];
                newContracts[index] = { ...newContracts[index], [field]: value };
                return { ...t, contracts: newContracts };
            }
            return t;
        }));
    }, []);

    const removeContract = useCallback((teamId, index) => {
        setTeams(prev => prev.map(t => {
            if (t.teamId === teamId) {
                const newContracts = [...(t.contracts || [])];
                newContracts.splice(index, 1);
                return { ...t, contracts: newContracts };
            }
            return t;
        }));
    }, []);

    const toggleContractVisibility = useCallback((teamId) => {
        setTeams(prev => prev.map(team =>
            team.teamId === teamId ? { ...team, _showContracts: !team._showContracts } : team
        ));
    }, []);

    const updateBarPool = useCallback((field, value) => {
        setBarTeam(prev => ({ ...prev, pools: { ...prev.pools, [field]: value } }));
    }, []);

    // Food sales has one behaviour no other pool field has: it PREFILLS the Runners
    // Fee at 3%, and only while the fee is still tracking that derivation. The rule
    // lives in `applyBarFoodSalesEdit` so it can be tested without a browser; what
    // matters here is that entering food sales on a shift settled under the old model
    // leaves that night's typed fee alone rather than silently moving its money.
    const updateBarFoodSales = useCallback((value) => {
        setBarTeam(prev => ({ ...prev, pools: applyBarFoodSalesEdit(prev.pools || {}, value) }));
    }, []);

    const updateRunnerPayout = (uid, value) => {
        setRunners(prev => prev.map(runner =>
            runner.uid === uid ? { ...runner, payoutAmount: value } : runner
        ));
    };

    const markUserHistoryFlags = useCallback(async (status, payouts = {}) => {
        const flagUpdate = getHistoryFlagUpdate(status);
        const participantUids = getShiftParticipantUids({ teams, barTeam, runners, payouts })
            .filter(uid => realEmployeeUids.has(uid));

        await Promise.all(participantUids.map(uid =>
            updateDoc(doc(db, "users", uid), flagUpdate).catch(ignoreMissingUserDoc)
        ));
    }, [barTeam, realEmployeeUids, runners, teams]);

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

    // Settle up always (re-)enters locked: switching day-steps or loading a new day
    // returns the money form to its read-only view.
    useEffect(() => {
        setSettleEditable(false);
    }, [step, date]);

    useEffect(() => {
        const loadShift = async () => {
            try {
                setLoading(true);
                setHasLoadedShift(false);
                setDraftStatus("");
                setShiftStatus(null);
                const shiftDoc = await getDoc(doc(db, "shifts", date));
                const emptyTeams = [
                    { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
                ];
                const emptyBar = { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } };
                let nextTeams = emptyTeams;
                let nextBar = emptyBar;
                let nextRunners = [];
                if (shiftDoc.exists()) {
                    const d = applyOpenShiftMemberNames(shiftDoc.data());
                    if (d.teams) {
                        nextTeams = d.teams.map(t => ({
                            teamId: t.teamId,
                            members: t.members || [],
                            pools: t.pools || { sales: t.teamSales || "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" },
                            contracts: t.contracts || []
                        }));
                    }
                    if (d.barTeam) {
                        nextBar = {
                            members: d.barTeam.members || [],
                            pools: d.barTeam.pools || { sales: "", tips: "", gratuity: "", covers: "" }
                        };
                    }
                    if (d.runners) nextRunners = d.runners;
                    setShiftStatus(d.status || (d.summary || d.firstClosedAt || d.payouts ? "closed" : "setup"));
                }
                setTeams(nextTeams);
                setBarTeam(nextBar);
                setRunners(nextRunners);
                // Baseline the loaded shift so Cancel knows whether anything changed.
                loadedFingerprintRef.current = fingerprintShift(nextTeams, nextBar, nextRunners);
            } catch (e) {
                console.error("Failed to load shift:", e);
            } finally {
                setHasLoadedShift(true);
                setLoading(false);
            }
        };
        loadShift();
    }, [date]);

    useEffect(() => {
        // Pause autosave while Settle up is unlocked: in-progress money edits must not
        // persist until Done, so Cancel can restore the pre-edit snapshot and discard.
        if (!hasLoadedShift || loading || isSaving || shiftStatus === "closed" || settleEditable) return undefined;
        if (!hasAssignedStaff && !hasCloseoutDraftData) return undefined;

        let cancelled = false;
        const timeoutId = window.setTimeout(async () => {
            setDraftStatus("Saving draft...");
            try {
                await setDoc(doc(db, "shifts", date), buildShiftSetupDraft({
                    date,
                    teams,
                    barTeam,
                    runners,
                    includeCloseoutDraft: true,
                }));

                if (!cancelled) {
                    setShiftStatus("setup");
                    setDraftStatus("Draft saved.");
                }
            } catch (e) {
                console.error("Failed to autosave closeout draft:", e);
                if (!cancelled) {
                    setDraftStatus("Draft autosave failed.");
                }
            }
        }, 1000);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [
        barTeam,
        date,
        hasAssignedStaff,
        hasCloseoutDraftData,
        hasLoadedShift,
        isSaving,
        loading,
        runners,
        settleEditable,
        shiftStatus,
        teams,
    ]);

    const handleSaveTeamSetup = async () => {
        if (isSaving) return;

        if (shiftStatus === "closed") {
            setSaveStatus("This shift is already closed and paid out. Go to Review and Confirm & Save Shift to update the roster and payouts together.");
            return false;
        }

        const inputErrors = validateTeamSetup({ teams, barTeam, runners });
        if (inputErrors.length > 0) {
            setValidationMessages(inputErrors);
            setSaveStatus("Assign staff before saving the floor plan.");
            return false;
        }

        setIsSaving(true);
        setValidationMessages([]);
        setSaveStatus("Saving floor plan...");
        const endPendingAction = beginPendingAction();

        try {
            await setDoc(doc(db, "shifts", date), buildShiftSetupDraft({ date, teams, barTeam, runners }));
            await markUserHistoryFlags("setup");
            setShiftStatus("setup");
            setSaveStatus("Floor plan saved.");
            setTimeout(() => setSaveStatus(""), 3000);
            return true;
        } catch (e) {
            console.error(e);
            setSaveStatus("Failed to save floor plan.");
            setValidationMessages(["The floor plan could not be saved. Please try again."]);
            return false;
        } finally {
            setIsSaving(false);
            endPendingAction();
        }
    };

    // PROTOTYPE (in-place edit): "Done" saves the floor and returns to the read-only
    // landing instead of advancing to Settle. Settle is reached from the day rail.
    const handleDoneFloor = async () => {
        const ok = await handleSaveTeamSetup();
        if (!ok) return;
        onClose();
    };

    // Settle up "Done": persist the entered money (as the shift's setup draft, the
    // same shape autosave writes) and RE-LOCK in place - stays on the Settle screen,
    // returning to the locked view. A closed shift instead takes the paid-out path
    // (Done -> Review -> Confirm & Save), so this only runs for a setup shift; the
    // closed case is wired to goToReview on the button.
    const handleDoneSettle = async () => {
        if (isSaving) return;
        setIsSaving(true);
        setSaveStatus("Saving money…");
        const endPendingAction = beginPendingAction();
        try {
            await setDoc(doc(db, "shifts", date), buildShiftSetupDraft({
                date,
                teams,
                barTeam,
                runners,
                includeCloseoutDraft: true,
            }));
            setShiftStatus("setup");
            setSaveStatus("Money saved.");
            setSettleEditable(false);
        } catch (e) {
            console.error("Failed to save settle-up money:", e);
            setSaveStatus("Failed to save money.");
        } finally {
            setIsSaving(false);
            endPendingAction();
        }
    };

    // Has the admin actually changed anything since the shift loaded?
    const isDirty = hasLoadedShift
        && loadedFingerprintRef.current !== ""
        && fingerprintShift(teams, barTeam, runners) !== loadedFingerprintRef.current;

    // Leaving the editor loses work only on a closed shift: a setup shift autosaves
    // its draft continuously, while a closed shift disables autosave (edits persist
    // only through Review -> Confirm & Save), so an in-progress edit would be dropped.
    // Read through a ref so the guard handed to the parent below can stay stable while
    // the fingerprint keeps changing on every keystroke.
    const leaveGuardStateRef = useRef({ isSaving: false, wouldDropWork: false });
    leaveGuardStateRef.current = {
        isSaving,
        wouldDropWork: shiftStatus === "closed" && isDirty,
    };

    // The single gate every exit from the editor passes through. Returns true when it
    // is safe to leave: no unsaved work, or the admin confirmed the discard. Nothing
    // in-editor is written either way - the caller re-reads the day.
    const confirmLeaveEditor = useCallback(() => {
        const { isSaving: saving, wouldDropWork } = leaveGuardStateRef.current;
        if (saving) return false;
        if (!wouldDropWork) return true;
        return window.confirm(DISCARD_EDIT_CONFIRMATION);
    }, []);

    // Hand the guard up so navigation that lives OUTSIDE this panel (the app bar's
    // home control, the workspace menu) warns exactly as Cancel does instead of
    // silently discarding the edit. Withdrawn on unmount so a stale guard can never
    // block navigation once the editor is gone.
    useEffect(() => {
        if (!onRegisterLeaveGuard) return undefined;
        onRegisterLeaveGuard(confirmLeaveEditor);
        return () => onRegisterLeaveGuard(null);
    }, [onRegisterLeaveGuard, confirmLeaveEditor]);

    // Cancel: leave edit mode WITHOUT committing and return to the read-only landing.
    // onClose() re-reads the day, so nothing in-editor is written.
    const handleCancelEdit = () => {
        if (!confirmLeaveEditor()) return;
        onClose();
    };

    // Settle up "Edit": snapshot the money as it stands, then unlock the fields.
    // Autosave is paused while unlocked (see the draft effect), so nothing persists
    // until Done - which lets Cancel restore this snapshot and truly discard.
    const handleEditSettle = () => {
        settleSnapshotRef.current = { teams, barTeam, runners };
        setSettleEditable(true);
    };

    // Settle up "Cancel": discard the in-progress edits by restoring the snapshot from
    // when Edit was pressed, then re-lock in place (stay on the Settle screen). On a
    // closed shift, confirm first when there are real changes to drop.
    const handleCancelSettle = () => {
        if (isSaving) return;
        const snapshot = settleSnapshotRef.current;
        const changed = snapshot
            && fingerprintShift(teams, barTeam, runners)
                !== fingerprintShift(snapshot.teams, snapshot.barTeam, snapshot.runners);
        if (shiftStatus === "closed" && changed) {
            const confirmed = window.confirm(
                "Discard your changes to this closed shift's money?\n\n" +
                "Edits to a paid-out shift are only saved when you go to Review and " +
                "Confirm & Save Shift. Discarding keeps the saved payouts unchanged."
            );
            if (!confirmed) return;
        }
        if (snapshot) {
            setTeams(snapshot.teams);
            setBarTeam(snapshot.barTeam);
            setRunners(snapshot.runners);
        }
        setSaveStatus("");
        setSettleEditable(false);
    };

    // Day rail step navigation (Floor -> Settle -> Review). Every step is one tap away
    // in the editor, including Review: it derives from the live inputs, so there is
    // nothing to unlock. (The old "Pay out" pill that exited to the landing was removed
    // - the side nav / save flows already return there.)
    const goToStep = (key) => {
        // Leaving Settle by the rail abandons an in-progress money edit's UNLOCKED state
        // but keeps the typed values, which is what the rail's other jumps already do.
        setStep(key);
    };

    // Review as a destination: used by the closed-shift Done buttons, which route the
    // paid-out edit through Review -> Confirm & Save rather than saving in place.
    const goToReview = () => {
        if (isSaving) return;
        setValidationMessages([]);
        setSaveStatus("");
        setSaveFailure(null);
        setSettleEditable(false);
        setStep("review");
    };

    const handleConfirmSave = async () => {
        // `saveBlocked` mirrors the reconciliation the write path re-runs and throws on,
        // so this is the same refusal made before anything is attempted rather than
        // after. The button is disabled in that state; this is the belt to its braces.
        if (isSaving || !liveReview.ready || saveBlocked) return;

        const mappedPayoutsForFirebase = liveReview.mappedPayouts;
        const result = liveReview.result;

        setIsSaving(true);
        setSaveStatus("Saving…");
        setSaveFailure(null);
        // Spans the write and the day refetch that onClose kicks off, so the
        // workspace progress bar reads as one wait rather than two.
        const endPendingAction = beginPendingAction();
        try {
            await saveClosedShiftAtomically({
                db,
                date,
                teams,
                barTeam,
                runners,
                payouts: mappedPayoutsForFirebase,
                summary: result,
                realEmployeeUids,
                updatedBy: user?.uid || null,
            });
            setShiftStatus("closed");
            // Reset before leaving: the leave guard refuses to let go while this is
            // set, and it used to stay true for the whole hand-over.
            setIsSaving(false);
            // Hand straight over to the saved day. This used to sit on a 1500ms
            // timer, which parked the admin on Review after the work was done and
            // put the "Saved." line on the screen they were about to leave; the
            // day landing is where the confirmation belongs.
            onClose({ saved: true });
        } catch (e) {
            console.error(e);
            // Deliberately no status line: it used to read "Failed to save." and that
            // was the ENTIRE on-screen explanation. The alert below now carries the
            // reason, and a four-word line above it would only say it worse twice.
            setSaveStatus("");
            // Who on this shift has no first name on their profile. firestore.rules
            // `validUserProfile()` requires one, and the closeout batch updates every
            // participant's user document, so a single nameless profile refuses the
            // whole batch - previously with nothing on screen naming the person or the
            // reason. Computed from data the editor already holds, only when a save has
            // actually failed.
            setSaveFailure(describeSaveFailure(e, {
                namelessParticipants: findNamelessParticipants({
                    participantUids: getShiftParticipantUids({
                        teams,
                        barTeam,
                        runners,
                        payouts: mappedPayoutsForFirebase,
                    }).filter(uid => realEmployeeUids.has(uid)),
                    employees: allEmployees || [],
                }),
            }));
            setIsSaving(false);
        } finally {
            endPendingAction();
        }
    };

    // Review no longer bounces back to Settle up when the numbers are not ready. Being
    // silently redirected was the confusing half of the old model - the captain tapped
    // Review and landed somewhere else with no explanation. Review is now always its
    // own screen; when the inputs are incomplete it says what is missing (see
    // `ReviewNotReady`) instead of pretending to be Settle up.
    const effectiveStep = step;

    // The editing "layer" (accent frame + "Editing" strip) is active on the floor and
    // review steps, and on Settle up only once it is unlocked. A locked Settle up reads
    // as a neutral, read-only view.
    const isEditingLayer = effectiveStep === "settle" ? settleEditable : true;
    // Closed-shift money steps keep their warning frame, so the accent editing frame
    // shows only when we are in the editing layer and not on a closed money step.
    const showEditFrame = isEditingLayer && !(shiftStatus === "closed" && effectiveStep !== "floor");

    // Day-level step status for the rail. Status is always shown; order is never
    // hard-forced - any earlier/reachable step is one tap away.
    const railSteps = getRailSteps({
        activeStep: effectiveStep,
        shiftStatus,
        reviewReady: liveReview.ready,
        hasFloorStaff: hasAssignedStaff,
    });

    // On a phone every step is BOUND to the viewport, not merely floored at it, and that
    // one distinction is the whole overflow defect. A `min-height` leaves the column's
    // used height auto, so it sizes to its CONTENT; the `flex-1 min-h-0` chain below it
    // then never gets a definite height to shrink against, and the inner `overflow-y-auto`
    // boxes never become scrollers. The PAGE scrolls instead, and the panel slides up
    // under the sticky Day Rail while the step's own chrome - the editing strip, the pool
    // summary, the group switcher - leaves the screen entirely. A definite height is what
    // hands the chain something to divide, so the inner box scrolls and the page does not.
    //
    // This was gated behind `(min-height: 700px)` and applied to the money steps alone,
    // which is why it read as a fix that had not taken: a phone browser's usable viewport
    // is routinely shorter than that (320x568, 375x667, 390x664 all miss it), so on the
    // screens that had the defect the rule never matched. The gate is gone; Review stays
    // bound to it. Floor plan and Settle up do not - see below.
    //
    // Content still packs snug at the top: the panel grows, the rows do not spread out.
    // Review scrolls its whole column inside the bound above; Settle up scrolls the
    // entry panel's BODY so the group's name and pool stay pinned; the floor plan scrolls
    // the ordinary page, same as everywhere else that isn't bound to the viewport.
    //
    // The `min-h` beside the height is a floor, not a fallback to the old behaviour: it
    // keeps the height DEFINITE (a min-height only clamps the used height, it does not
    // return it to auto) so the chain still works, while stopping a rotated or unusually
    // short viewport from squeezing the money into a slot no field fits in. At 320x568 -
    // the tight phone - the calc wins at 472px and the floor never bites.
    // Settle up and the floor plan are deliberately NOT bound to the viewport. Settle:
    // the captain asked for the titled money card to hug its own content instead of
    // stretching to fill the screen with an internal scroller. Floor: an inner
    // scrollport made the team grid read as boxed - a hard-clipped edge instead of the
    // kit's floating cards, and a second scroll target (tap the gutter beside the
    // floating Cancel/Done pair and the OUTER column scrolled instead of the grid,
    // because two nested scrollers were both listening). The captain asked for one
    // scroll: the page, with the team cards passing behind the fixed action pair the
    // same way FloatingActions already floats over the day landing's payout rows.
    // Both reintroduce the page-scroll shape the comment above warns about, on
    // purpose, scoped to these two steps.
    const isFullHeightStep = effectiveStep === "review";
    // Review fuses the rail into the card below (square corners, no gap) so the
    // context band inside reads as one surface. Floor plan and Settle up keep the
    // rail as its own separate, fully-rounded floating card above a gap - both
    // steps float on the page background rather than sit inside an outer panel.
    const railAttachesToCard = effectiveStep === "review";
    const stepContent = loading ? (
        <div className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
            Loading shift data…
        </div>
    ) : (
        <div className={"p-3 sm:p-6" + (isFullHeightStep ? " max-[560px]:flex-1 max-[560px]:flex max-[560px]:flex-col max-[560px]:min-h-0" : "")}>
            {/* The Day Rail above names the active step, so no duplicate
                step heading is rendered here. */}

            {/* Not on Review. There the messages are the engine's own validations,
                which the captain already passed through on the way here, and the
                block is tall enough to push the spot-check card - the one thing
                Review exists for - off the top of a phone screen. Floor and Settle
                up still show it, because there it carries the errors that block a
                save and it sits above the fields those errors name. Review's own
                save progress/failure surfaces inline next to its save button. */}
            {validationMessages.length > 0 && effectiveStep !== "review" ? (
                <div role="alert" className="mb-4 px-4 py-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-[var(--radius-sm)]">
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

            {effectiveStep === "floor" ? (
                <FloorStep
                    allEmployees={allEmployees}
                    teams={teams}
                    setTeams={setTeams}
                    barTeam={barTeam}
                    setBarTeam={setBarTeam}
                    runners={runners}
                    setRunners={setRunners}
                    shiftStatus={shiftStatus}
                    isSaving={isSaving}
                    onCancel={handleCancelEdit}
                    onDoneFloor={handleDoneFloor}
                    onGoToReview={goToReview}
                />
            ) : effectiveStep === "settle" ? (
                <SettleStep
                    closeoutGroups={closeoutGroups}
                    activeGroupId={activeGroupId}
                    onSelectGroup={setActiveGroupId}
                    poolSummary={poolSummary}
                    poolGroupSummary={poolGroupSummary}
                    groupStatusSummary={groupStatusSummary}
                    teams={teams}
                    barTeam={barTeam}
                    runners={runners}
                    settleEditable={settleEditable}
                    shiftStatus={shiftStatus}
                    isSaving={isSaving}
                    saveStatus={saveStatus}
                    draftStatus={draftStatus}
                    onPoolChange={updatePool}
                    onToggleContracts={toggleContractVisibility}
                    onAddContract={addContract}
                    onUpdateContract={updateContract}
                    onRemoveContract={removeContract}
                    onBarPoolChange={updateBarPool}
                    onBarFoodSalesChange={updateBarFoodSales}
                    onTeamMemberPointsChange={updateTeamMemberPoints}
                    onTeamMemberPointsAdjust={adjustTeamMemberPoints}
                    onBarMemberPointsChange={updateBarMemberPoints}
                    onBarMemberPointsAdjust={adjustBarMemberPoints}
                    onRunnerPayoutChange={updateRunnerPayout}
                    onEditSettle={handleEditSettle}
                    onCancelSettle={handleCancelSettle}
                    onDoneSettle={handleDoneSettle}
                    onGoToReview={goToReview}
                />
            ) : (
                <ReviewStep
                    saveFailure={saveFailure}
                    liveReview={liveReview}
                    saveBlocked={saveBlocked}
                    balanceReport={balanceReport}
                    poolSummary={poolSummary}
                    reviewMoneyGroups={reviewMoneyGroups}
                    reviewFloorGroups={reviewFloorGroups}
                    hasAssignedStaff={hasAssignedStaff}
                    shiftStatus={shiftStatus}
                    date={date}
                    saveStatus={saveStatus}
                    draftStatus={draftStatus}
                    isSaving={isSaving}
                    onFixMoney={() => setStep("settle")}
                    onFixFloor={() => setStep("floor")}
                    onConfirmSave={handleConfirmSave}
                />
            )}
        </div>
    );

    return (
        <div className={"space-y-3 sm:space-y-4"
            + (isFullHeightStep ? " max-[560px]:flex max-[560px]:flex-col max-[560px]:h-[calc(100dvh-6rem)] max-[560px]:min-h-[420px]" : "")
            + (railAttachesToCard || effectiveStep === "settle" ? " max-[560px]:space-y-0" : " max-[560px]:space-y-2")}>
            {/* The day rail: an ordered, day-level step spine. Status is always
                shown; earlier/reachable steps are one tap away (order never forced).
                On a phone, Review fuses the rail into its editor Card below: square
                bottom corners, no gap, and the same tint as the context band inside,
                so the boxes divide context from entry rather than from itself. Floor
                plan and Settle up do not - each stays its own floating card, floating
                on the page background rather than inside an outer white panel. */}
            <DayRail steps={railSteps} onStepClick={goToStep}
                bleed={!railAttachesToCard}
                className={railAttachesToCard ? "max-[560px]:rounded-b-none max-[560px]:bg-[var(--color-band)]" : ""} />

            {effectiveStep === "floor" || effectiveStep === "settle" ? (
                <div>
                    {stepContent}
                </div>
            ) : (
            <Card className={"!p-0 " + (railAttachesToCard ? "max-[560px]:rounded-t-none max-[560px]:border-t-0 " : "") + (showEditFrame
                ? "ring-2 ring-[var(--color-accent)]/25 shadow-[0_10px_30px_rgba(47,111,79,0.10)]"
                : "")
                + (isFullHeightStep ? " max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0" : "")}>
                <header className="hidden sm:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--color-line)]">
                    <div className="flex flex-col gap-1">
                        {/* No date here: the app bar now carries the day being edited
                            at every width, pinned, and in a readable form. This header
                            printed the raw ISO key, so the same day appeared twice on
                            one screen in two different formats. */}
                        <h2 className="font-display text-base sm:text-lg font-medium tracking-tight text-[var(--color-ink)]">
                            Shift Workspace
                        </h2>
                        {(shiftStatus === "closed" && effectiveStep !== "floor") ? (
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                Closed shift
                            </span>
                        ) : (
                            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
                                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                                Editing
                            </span>
                        )}
                        {saveStatus ? (
                            <span className="text-xs text-[var(--color-ink-soft)]">{saveStatus}</span>
                        ) : draftStatus ? (
                            <span className="text-xs text-[var(--color-ink-soft)]">{draftStatus}</span>
                        ) : null}
                    </div>
                </header>

                {/* Mobile status strip: the workspace header above is `hidden sm:flex`,
                    so on phones the closed / paid-out cue would otherwise vanish and an
                    admin could re-save a paid-out shift blind. Surface a compact,
                    always-visible strip. Non-closed shows an accent "Editing floor plan"
                    cue (matching the workspace's accent frame) so it is clear you are in
                    the editing layer, not the read-only floor view. */}
                {/* Both strips PIN under the Day Rail rather than scrolling beneath it.
                    On a short viewport the editor column hits its 420px floor, the page
                    starts to scroll, and the rail - being sticky - slid straight over
                    whichever strip sat below it. The cue that says you are editing, or
                    that this shift is already paid out, is exactly the thing that must
                    not disappear the moment you move the screen. */}
                {(shiftStatus === "closed" && effectiveStep !== "floor") ? (
                    <div className="sm:hidden sticky top-[var(--rail-stack-top)] z-[9] flex items-center gap-2 px-3 py-1 border-b border-[var(--color-warning)]/25 bg-[var(--color-warning-soft)]">
                        {/* The raw ISO date used to sit at the right of this strip,
                            because the day was otherwise invisible on a phone. The app
                            bar now carries it, pinned and readable, so this strip is
                            back to saying only what it is for: this shift is paid out.

                            Sized down to a marker rather than a banner: it has to be
                            unmissable before a re-save, not loud, and every pixel it
                            spends comes straight off the money below it. It keeps the
                            warning colour and the dot, which is what makes it read at
                            this size - do not also shrink those. */}
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-warning)]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                            Closed shift · Paid out
                        </span>
                    </div>
                ) : (isEditingLayer && effectiveStep !== "floor") ? (
                    <div className="sm:hidden sticky top-[var(--rail-stack-top)] z-[9] flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)]">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-accent)]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                            {effectiveStep === "settle" ? "Editing · Settle up" : "Editing · Review"}
                        </span>
                    </div>
                ) : null
                /* A locked Settle up used to print a neutral "SETTLE UP" strip here. The
                   Day Rail directly above already marks Settle as the active step, so the
                   strip said the step's name a second time and charged the money below it
                   a full band of height to do so. The two strips that remain each say
                   something the rail does not: this shift is already paid out, and you are
                   in the editing layer. */}

                {stepContent}
            </Card>
            )}

        </div>
    );
}

export default ShiftEditorPanel;
