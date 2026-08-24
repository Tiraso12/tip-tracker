import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { calculateShift } from "../../utils/engine";
import DayRail from "./DayRail";
import { getRailSteps } from "../../utils/dayFlow";
import { clearMarkOnEdit, summarizeCloseReadiness } from "../../utils/settleStatus";
import { saveClosedShiftAtomically } from "../../utils/closeoutPersistence";
import { buildShiftSetupDraft } from "../../utils/shiftPersistence";
import { RUNNER_FLAT_RATE } from "../../utils/constants";
import {
    applyTeamGroupPatch,
    buildBarGroupPatch,
    buildTeamGroupDraft,
    SETTLE_GROUP_COLLECTION,
    shouldAcceptRemoteGroupUpdate,
} from "../../utils/settleGroupPersistence";
import { getHistoryFlagUpdate, getShiftParticipantUids } from "../../utils/userHistoryFlags";
import { useAuth } from "../../context/AuthContext";
import { usePendingActions } from "../../context/PendingActionsContext";
import {
    applyBarFoodSalesEdit,
    buildCloseoutGroups,
    buildPayoutReview,
    fmtAmount,
    getBarSummary,
    getTeamSummary,
    ignoreMissingUserDoc,
    mapPayoutsForFirebase,
    toMoney,
    validateShiftInputs,
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

function ShiftEditorPanel({ date, allEmployees, onClose, onGroupMarkedDone, onBackToLanding, initialStep = "floor", initialActiveGroupId = null, onRegisterLeaveGuard, onRemoveSetupDay, removingSetupDay = false }) {
    const { user } = useAuth();
    const { beginPendingAction } = usePendingActions();
    const [teams, setTeams] = useState([
        { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
    ]);
    const [barTeam, setBarTeam] = useState({ members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } });
    const [runners, setRunners] = useState([]);
    const [saveStatus, setSaveStatus] = useState("");
    // What came back from a refused Confirm & Save, in captain-facing wording.
    const [saveFailure, setSaveFailure] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasLoadedShift, setHasLoadedShift] = useState(false);
    const [shiftStatus, setShiftStatus] = useState(null);
    // Day-step spine (shared by both flow shells): "floor" -> "settle" -> "review".
    // The old two-accordion editor is retired; each step is its own focused screen.
    const [step, setStep] = useState(["settle", "review"].includes(initialStep) ? initialStep : "floor");
    const [activeGroupId, setActiveGroupId] = useState(initialActiveGroupId || "team-1");
    const [draftStatus, setDraftStatus] = useState("");
    // Parallel Settle up's quiet cue (plan Q9): which group, if any, just had its
    // "done" mark silently cleared by an edit, so SettleStep can show a fading
    // inline notice next to that group's Save and Mark Done button.
    const [unmarkedCueGroupId, setUnmarkedCueGroupId] = useState(null);
    const unmarkedCueTimeoutRef = useRef(null);
    const triggerUnmarkedCue = useCallback((groupId) => {
        setUnmarkedCueGroupId(groupId);
        if (unmarkedCueTimeoutRef.current) window.clearTimeout(unmarkedCueTimeoutRef.current);
        unmarkedCueTimeoutRef.current = window.setTimeout(() => setUnmarkedCueGroupId(null), 3000);
    }, []);
    useEffect(() => () => {
        if (unmarkedCueTimeoutRef.current) window.clearTimeout(unmarkedCueTimeoutRef.current);
    }, []);
    // Fingerprint of the shift as loaded, so the leave-guard can tell an untouched view
    // from one with real edits and only confirm a discard when work would actually be
    // lost. Covers money too - `fingerprintShift` reads pools nested inside teams/barTeam.
    const loadedFingerprintRef = useRef("");
    const realEmployeeUids = useMemo(
        () => new Set((allEmployees || []).map(employee => employee.uid).filter(Boolean)),
        [allEmployees]
    );

    // Live-mirrored so a debounced write (fires up to a second after the
    // keystroke that scheduled it) reads the LATEST group state rather than a
    // stale value captured when the timer was set.
    const teamsRef = useRef(teams);
    teamsRef.current = teams;
    const barTeamRef = useRef(barTeam);
    barTeamRef.current = barTeam;
    // Which group is actively being edited right now, read from inside the two
    // live Firestore listeners below (they must not resubscribe on every tab
    // switch, so they read this ref rather than closing over `activeGroupId`).
    const activeGroupIdRef = useRef(activeGroupId);
    activeGroupIdRef.current = activeGroupId;
    // True once the first shift-doc snapshot has been processed - see the load
    // effect below. Read from inside that same listener, which cannot close
    // over the `hasLoadedShift` state without resubscribing on every change.
    const hasLoadedShiftRef = useRef(false);

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
    // then Runners. Each carries the display name, roster sub-line, live pool, the
    // money-in status, and the close-readiness ("Save and Mark Done") status. Pulled
    // out to shiftEditorUtils.js so the day landing's read-only who's-left checklist
    // can build the exact same rows without opening the editor.
    const closeoutGroups = useMemo(
        () => buildCloseoutGroups({ teams, barTeam, runners }),
        [teams, barTeam, runners]
    );

    // Confirm & Save's gate (Direction A, 2026-08-23 lock): every assigned dining
    // team AND Bar must be marked done; Runners is excluded by construction.
    const closeReadiness = useMemo(
        () => summarizeCloseReadiness(closeoutGroups),
        [closeoutGroups]
    );
    // The count beside the Pool figure counts only the groups that figure is made
    // of. `payoutPool` is dining CTP + GRT + bar CTP + bar GRT; runner pay is not in
    // it and never was - it is a deduction off the top, which is why the Runners pill
    // is labelled "Pay" and not "Pool". Counting Runners there put a group in the
    // headline that contributes nothing to the money printed next to it, so "5
    // groups · Pool $X" described five groups with four groups' money.
    const poolGroupCount = closeoutGroups.filter(group => group.kind !== "runners").length;

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

    // Direction A's own gate (2026-08-23 lock), independent of the balance check
    // above: every assigned dining team and Bar must be marked done before
    // Confirm & Save unlocks. Only while the shift is still being settled - once
    // closed, a correction re-save asks only that the shift balances, exactly as
    // it always has (re-marking every group done on every later correction would
    // be a regression nobody asked for).
    const closeGateBlocked = shiftStatus !== "closed" && !closeReadiness.ready;

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

    // Writes exactly one group's money/contracts/markedDone, reading the LATEST
    // value through the live-mirrored refs above rather than a closure - this is
    // what makes a debounced write correct even though the timer was scheduled a
    // full second (and possibly several keystrokes) earlier.
    const writeGroupNow = useCallback(async (groupId) => {
        const now = new Date().toISOString();
        try {
            if (groupId === "bar") {
                await updateDoc(doc(db, "shifts", date), buildBarGroupPatch({
                    pools: barTeamRef.current.pools,
                    markedDone: Boolean(barTeamRef.current.markedDone),
                    now,
                    updatedBy: user?.uid || null,
                }));
                return;
            }
            const team = teamsRef.current.find(t => t.teamId === groupId);
            if (!team) return;
            await setDoc(doc(db, "shifts", date, SETTLE_GROUP_COLLECTION, groupId), buildTeamGroupDraft({
                pools: team.pools,
                contracts: team.contracts,
                markedDone: Boolean(team.markedDone),
                now,
                updatedBy: user?.uid || null,
            }));
        } catch (e) {
            console.error(`Failed to save the ${groupId} settle draft:`, e);
        }
    }, [date, user?.uid]);

    const pendingGroupSaveRef = useRef({ groupId: null, timeoutId: null });

    // Debounced scoped write for whichever group is actively being typed into -
    // the direct replacement for the old whole-document autosave's money half.
    // Called from inside each pool/contract field handler below, not from a
    // broad effect watching `teams`/`barTeam`: that would also fire whenever a
    // REMOTE update lands (a different Supervisor's save), rescheduling a write
    // for a group nobody here actually touched.
    const scheduleGroupSave = useCallback((groupId) => {
        const pending = pendingGroupSaveRef.current;
        if (pending.timeoutId != null) window.clearTimeout(pending.timeoutId);
        pendingGroupSaveRef.current = {
            groupId,
            timeoutId: window.setTimeout(() => {
                pendingGroupSaveRef.current = { groupId: null, timeoutId: null };
                writeGroupNow(groupId);
            }, 1000),
        };
    }, [writeGroupNow]);

    // Save-now, used when leaving a group (tab switch, leaving Settle up,
    // closing the editor) so a debounce in flight is never silently dropped -
    // only cancelled-and-abandoned, which is what plain effect cleanup would do.
    const flushPendingGroupSave = useCallback(() => {
        const pending = pendingGroupSaveRef.current;
        if (pending.timeoutId == null) return;
        window.clearTimeout(pending.timeoutId);
        pendingGroupSaveRef.current = { groupId: null, timeoutId: null };
        writeGroupNow(pending.groupId);
    }, [writeGroupNow]);

    // A dining team's or Bar's money/contract fields all funnel through
    // `settleWrite(groupId)` after updating local state: clear an existing
    // "done" mark (plan Q9's silent clear, with the quiet cue only when a mark
    // actually existed), then schedule that group's scoped save. A closed shift
    // never schedules one - it disables autosave entirely, same as it always
    // has: those edits persist only through Review -> Confirm & Save.
    const settleWrite = useCallback((groupId, wasMarkedDone) => {
        if (shiftStatus === "closed") return;
        const { justCleared } = clearMarkOnEdit(wasMarkedDone);
        if (justCleared) triggerUnmarkedCue(groupId);
        scheduleGroupSave(groupId);
    }, [scheduleGroupSave, shiftStatus, triggerUnmarkedCue]);

    const updatePool = useCallback((teamId, field, value) => {
        let wasMarkedDone = false;
        setTeams(prev => prev.map(t => {
            if (t.teamId !== teamId) return t;
            wasMarkedDone = Boolean(t.markedDone);
            return { ...t, pools: { ...t.pools, [field]: value }, markedDone: false };
        }));
        settleWrite(teamId, wasMarkedDone);
    }, [settleWrite]);

    const addContract = useCallback((teamId) => {
        let wasMarkedDone = false;
        setTeams(prev => prev.map(t => {
            if (t.teamId !== teamId) return t;
            wasMarkedDone = Boolean(t.markedDone);
            return { ...t, contracts: [...(t.contracts || []), { name: "", gratuity: "" }], markedDone: false };
        }));
        settleWrite(teamId, wasMarkedDone);
    }, [settleWrite]);

    const updateContract = useCallback((teamId, index, field, value) => {
        let wasMarkedDone = false;
        setTeams(prev => prev.map(t => {
            if (t.teamId === teamId) {
                wasMarkedDone = Boolean(t.markedDone);
                const newContracts = [...(t.contracts || [])];
                newContracts[index] = { ...newContracts[index], [field]: value };
                return { ...t, contracts: newContracts, markedDone: false };
            }
            return t;
        }));
        settleWrite(teamId, wasMarkedDone);
    }, [settleWrite]);

    const removeContract = useCallback((teamId, index) => {
        let wasMarkedDone = false;
        setTeams(prev => prev.map(t => {
            if (t.teamId === teamId) {
                wasMarkedDone = Boolean(t.markedDone);
                const newContracts = [...(t.contracts || [])];
                newContracts.splice(index, 1);
                return { ...t, contracts: newContracts, markedDone: false };
            }
            return t;
        }));
        settleWrite(teamId, wasMarkedDone);
    }, [settleWrite]);

    const toggleContractVisibility = useCallback((teamId) => {
        setTeams(prev => prev.map(team =>
            team.teamId === teamId ? { ...team, _showContracts: !team._showContracts } : team
        ));
    }, []);

    const updateBarPool = useCallback((field, value) => {
        let wasMarkedDone = false;
        setBarTeam(prev => {
            wasMarkedDone = Boolean(prev.markedDone);
            return { ...prev, pools: { ...prev.pools, [field]: value }, markedDone: false };
        });
        settleWrite("bar", wasMarkedDone);
    }, [settleWrite]);

    // Food sales has one behaviour no other pool field has: it PREFILLS the Runners
    // Fee at 3%, and only while the fee is still tracking that derivation. The rule
    // lives in `applyBarFoodSalesEdit` so it can be tested without a browser; what
    // matters here is that entering food sales on a shift settled under the old model
    // leaves that night's typed fee alone rather than silently moving its money.
    const updateBarFoodSales = useCallback((value) => {
        let wasMarkedDone = false;
        setBarTeam(prev => {
            wasMarkedDone = Boolean(prev.markedDone);
            return { ...prev, pools: applyBarFoodSalesEdit(prev.pools || {}, value), markedDone: false };
        });
        settleWrite("bar", wasMarkedDone);
    }, [settleWrite]);

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

    // Two Supervisors, live (2026-08-23 lock): the one-time `getDoc` this used to
    // be is replaced by a live subscription, so a second Supervisor's Settle up
    // edits appear on screen instead of only landing behind your back on refetch.
    // Money/contracts/markedDone for a dining team, though, are NOT read off this
    // snapshot post-load - they come from the settleGroups listener below, which
    // is each team's own scoped source of truth (see settleGroupPersistence.js
    // for why `teams` being an array forces this split). Whichever group is
    // actively selected (`activeGroupIdRef`) is fully protected from both
    // listeners while it is being edited, so an unrelated remote write can never
    // revert in-flight typing - see the same ref's other reads below.
    useEffect(() => {
        setLoading(true);
        setHasLoadedShift(false);
        setDraftStatus("");
        setShiftStatus(null);
        hasLoadedShiftRef.current = false;

        const emptyTeams = [
            { teamId: "team-1", members: [], pools: { sales: "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" }, contracts: [] }
        ];
        const emptyBar = { members: [], pools: { sales: "", tips: "", gratuity: "", covers: "" } };

        const unsubscribeShift = onSnapshot(
            doc(db, "shifts", date),
            (shiftDoc) => {
                let nextTeamsRoster = emptyTeams;
                let nextBar = emptyBar;
                let nextRunners = [];
                let nextStatus = null;
                if (shiftDoc.exists()) {
                    const d = applyOpenShiftMemberNames(shiftDoc.data());
                    if (d.teams) {
                        nextTeamsRoster = d.teams.map(t => ({
                            teamId: t.teamId,
                            members: t.members || [],
                            pools: t.pools || { sales: t.teamSales || "", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" },
                            contracts: t.contracts || []
                        }));
                    }
                    if (d.barTeam) {
                        nextBar = {
                            members: d.barTeam.members || [],
                            pools: d.barTeam.pools || { sales: "", tips: "", gratuity: "", covers: "" },
                            markedDone: Boolean(d.barTeam.markedDone),
                        };
                    }
                    if (d.runners) nextRunners = d.runners;
                    nextStatus = d.status || (d.summary || d.firstClosedAt || d.payouts ? "closed" : "setup");
                }
                setShiftStatus(nextStatus);

                const bootstrapping = !hasLoadedShiftRef.current;
                setTeams(prevTeams => {
                    if (bootstrapping) return nextTeamsRoster.map(t => ({ ...t, markedDone: false }));
                    const byId = new Map(prevTeams.map(t => [t.teamId, t]));
                    return nextTeamsRoster.map(rosterTeam => {
                        const existing = byId.get(rosterTeam.teamId);
                        if (!existing) return { ...rosterTeam, markedDone: false };
                        // Active: fully protected (including its own roster) so an
                        // unrelated remote write can never revert in-flight edits here.
                        // Inactive: roster stays fresh; pools/contracts/markedDone stay
                        // exactly as the settleGroups listener last set them - taking
                        // them from here too would let a roster-only remote write
                        // (Floor plan, elsewhere) echo a stale money value backward.
                        if (rosterTeam.teamId === activeGroupIdRef.current) return existing;
                        return { ...existing, members: rosterTeam.members };
                    });
                });
                setBarTeam(prev => {
                    if (bootstrapping || activeGroupIdRef.current !== "bar") return nextBar;
                    return prev;
                });
                setRunners(prev => (
                    (!bootstrapping && activeGroupIdRef.current === "runners") ? prev : nextRunners
                ));

                if (bootstrapping) {
                    // Baseline the loaded shift so Cancel knows whether anything changed.
                    loadedFingerprintRef.current = fingerprintShift(nextTeamsRoster, nextBar, nextRunners);
                    hasLoadedShiftRef.current = true;
                    setHasLoadedShift(true);
                    setLoading(false);
                }
            },
            (e) => {
                console.error("Failed to watch shift:", e);
                hasLoadedShiftRef.current = true;
                setHasLoadedShift(true);
                setLoading(false);
            }
        );

        // A dining team's money/contracts/markedDone, live, one doc per team -
        // see settleGroupPersistence.js. The first batch this collection ever
        // delivers is applied unconditionally (even to the active tab): without
        // that, a returning Supervisor whose default tab happens to be a team
        // with already-saved money would never see it, because the "protect the
        // active group" rule below would otherwise treat their own first load as
        // a remote write to refuse.
        let settleGroupsBootstrapped = false;
        const unsubscribeSettleGroups = onSnapshot(
            collection(db, "shifts", date, SETTLE_GROUP_COLLECTION),
            (snapshot) => {
                const isInitialBatch = !settleGroupsBootstrapped;
                snapshot.docChanges().forEach((change) => {
                    const groupId = change.doc.id;
                    if (groupId === "bar") return; // Bar's source of truth is the shift doc itself.
                    const data = change.type === "removed" ? {} : change.doc.data();
                    const patch = {
                        pools: data.pools || {},
                        contracts: data.contracts || [],
                        markedDone: Boolean(data.markedDone),
                    };
                    setTeams(prev => {
                        if (!isInitialBatch && !shouldAcceptRemoteGroupUpdate(groupId, activeGroupIdRef.current)) return prev;
                        if (!prev.some(t => t.teamId === groupId)) return prev;
                        return applyTeamGroupPatch(prev, groupId, patch);
                    });
                });
                settleGroupsBootstrapped = true;
            },
            (e) => console.error("Failed to watch settle group drafts:", e)
        );

        return () => {
            unsubscribeShift();
            unsubscribeSettleGroups();
        };
    }, [date]);

    useEffect(() => () => flushPendingGroupSave(), [flushPendingGroupSave]);

    // The sole persistence path for a setup shift, covering Floor AND Settle -
    // both are directly editable with no lock/Cancel/Done, so this is the only
    // thing that saves either, INCLUDING creating `shifts/{date}` itself for a
    // shift built entirely from scratch. Debounced 1s, but flushable: a caller
    // that is about to navigate away (handleMarkGroupDone below) can force this
    // write to happen NOW rather than let an unmount silently cancel a still-
    // pending timer and drop the shift's own creation write - the bug a
    // Supervisor hit by entering money and marking a brand-new shift's only
    // team done fast enough that the whole-document save hadn't landed yet.
    const pendingDraftSaveRef = useRef({ timeoutId: null, run: null });

    const flushPendingDraftSave = useCallback(async () => {
        const pending = pendingDraftSaveRef.current;
        if (pending.timeoutId == null) return;
        window.clearTimeout(pending.timeoutId);
        await pending.run();
    }, []);

    useEffect(() => () => flushPendingDraftSave(), [flushPendingDraftSave]);

    // "Save and Mark Done": commits the group's current fields right now (not on
    // the trailing debounce) plus the mark itself, in one write - the button's
    // own name says "save", not just "mark". Never reachable on a closed shift
    // (SettleStep doesn't render the button there), guarded again here anyway.
    //
    // Friendly entry (Path 3, decision 3 / build step 5): `onGroupMarkedDone`
    // fires once the write actually lands, not optimistically - the caller
    // navigates back to the who's-left landing, and that landing re-reads this
    // same settleGroups collection, so it must not read "done" before Firestore
    // does. It also awaits `flushPendingDraftSave` alongside its own write - a
    // shift built from scratch this same visit may still have its very first
    // whole-document save (the one that creates `shifts/{date}` and the floor
    // plan on it) sitting on the 1s debounce below; without the flush, marking
    // done navigates away, the panel unmounts, and that pending save is
    // cancelled before it ever lands - the landing then reads no shift at all.
    const handleMarkGroupDone = useCallback((groupId) => {
        if (shiftStatus === "closed") return;
        const pending = pendingGroupSaveRef.current;
        if (pending.groupId === groupId && pending.timeoutId != null) {
            window.clearTimeout(pending.timeoutId);
            pendingGroupSaveRef.current = { groupId: null, timeoutId: null };
        }
        const now = new Date().toISOString();
        if (groupId === "bar") {
            setBarTeam(prev => ({ ...prev, markedDone: true }));
            Promise.all([
                flushPendingDraftSave(),
                updateDoc(doc(db, "shifts", date), buildBarGroupPatch({
                    pools: barTeam.pools, markedDone: true, now, updatedBy: user?.uid || null,
                })),
            ])
                .then(() => onGroupMarkedDone?.(groupId))
                .catch(e => console.error("Failed to save Bar's settle draft:", e));
            return;
        }
        const team = teams.find(t => t.teamId === groupId);
        if (!team) return;
        setTeams(prev => prev.map(t => (t.teamId === groupId ? { ...t, markedDone: true } : t)));
        Promise.all([
            flushPendingDraftSave(),
            setDoc(doc(db, "shifts", date, SETTLE_GROUP_COLLECTION, groupId), buildTeamGroupDraft({
                pools: team.pools, contracts: team.contracts, markedDone: true, now, updatedBy: user?.uid || null,
            })),
        ])
            .then(() => onGroupMarkedDone?.(groupId))
            .catch(e => console.error(`Failed to save the ${groupId} settle draft:`, e));
    }, [barTeam.pools, date, flushPendingDraftSave, onGroupMarkedDone, shiftStatus, teams, user?.uid]);

    useEffect(() => {
        // Stays off for a closed shift: edits there persist only through
        // Review -> Confirm & Save (see handleConfirmSave below).
        if (!hasLoadedShift || loading || isSaving || removingSetupDay || shiftStatus === "closed") return undefined;
        if (!hasAssignedStaff && !hasCloseoutDraftData) return undefined;

        const wasAlreadySetup = shiftStatus === "setup";
        const run = async () => {
            pendingDraftSaveRef.current = { timeoutId: null, run: null };
            setDraftStatus("Saving draft...");
            try {
                await setDoc(doc(db, "shifts", date), buildShiftSetupDraft({
                    date,
                    teams,
                    barTeam,
                    runners,
                    includeCloseoutDraft: true,
                }));
                // Only on the transition into "setup" - once flagged there is nothing
                // more to mark, and this would otherwise re-write every participant's
                // profile on every autosave tick while actively editing.
                if (!wasAlreadySetup) await markUserHistoryFlags("setup");

                setShiftStatus("setup");
                setDraftStatus("Draft saved.");
            } catch (e) {
                console.error("Failed to autosave closeout draft:", e);
                setDraftStatus("Draft autosave failed.");
            }
        };

        const timeoutId = window.setTimeout(run, 1000);
        pendingDraftSaveRef.current = { timeoutId, run };

        return () => {
            // Only this instance's own still-pending timer - a flush (or the
            // timer firing normally) already cleared the ref itself, and must
            // not be cancelled out from under it by a later render's cleanup.
            if (pendingDraftSaveRef.current.timeoutId === timeoutId) {
                window.clearTimeout(timeoutId);
                pendingDraftSaveRef.current = { timeoutId: null, run: null };
            }
        };
    }, [
        barTeam,
        date,
        hasAssignedStaff,
        hasCloseoutDraftData,
        hasLoadedShift,
        isSaving,
        loading,
        markUserHistoryFlags,
        removingSetupDay,
        runners,
        shiftStatus,
        teams,
    ]);

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

    // Day rail step navigation (Floor -> Settle -> Review). Every step is directly
    // editable and one tap away, including Review: it derives from the live inputs,
    // so there is nothing to unlock or commit first. The only exit that needs
    // confirming is leaving the EDITOR entirely on a dirty closed shift - see
    // confirmLeaveEditor above; switching steps within it never does.
    const goToStep = (key) => {
        // Leaving Settle up (any direction) flushes rather than abandons a
        // debounce in flight - see flushPendingGroupSave.
        if (step === "settle" && key !== "settle") flushPendingGroupSave();
        setStep(key);
    };

    // Direction A: switching tabs stays on Settle up (no navigation), but the
    // group being LEFT still needs its pending debounce flushed first - the
    // same reason goToStep flushes above, just one level narrower.
    const handleSelectGroup = useCallback((groupId) => {
        flushPendingGroupSave();
        setActiveGroupId(groupId);
    }, [flushPendingGroupSave]);

    const handleConfirmSave = async () => {
        // `saveBlocked`/`closeGateBlocked` mirror checks the write path itself
        // enforces (the balance re-check throws; the close gate is UI-only but
        // the button is disabled in the same state), so this is the same refusal
        // made before anything is attempted rather than after.
        if (isSaving || !liveReview.ready || saveBlocked || closeGateBlocked) return;

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

    // Day-level step status for the rail. Status is always shown; order is never
    // hard-forced - any earlier/reachable step is one tap away.
    const railSteps = getRailSteps({
        activeStep: effectiveStep,
        shiftStatus,
        reviewReady: liveReview.ready,
        hasFloorStaff: hasAssignedStaff,
    });

    // Every step used to be BOUND to the viewport on a phone: a definite height for a
    // `flex-1 min-h-0` chain to shrink against, so an inner `overflow-y-auto` box
    // scrolled and the page did not. That inner scrollport was itself a leftover
    // wrapper - it hard-clipped cards at its edges when scrolled and read as a boxed
    // seam above the floating action pair instead of ordinary page content passing
    // behind it. Floor plan shed it first; Review gets the identical fix here for the
    // identical defect. Neither is bound anymore - both now scroll with the page like
    // everywhere else that isn't explicitly viewport-bound, and their cards pass behind
    // the floating action pair the same way FloatingActions already floats over content
    // elsewhere. Settle up was never bound to begin with: the captain asked for the
    // titled money card to hug its own content instead of stretching to fill the screen
    // with an internal scroller. No current step needs the viewport-bound treatment, so
    // nothing below reaches for it - a future step that does can reintroduce the flag.
    const stepContent = loading ? (
        <div className="px-6 py-12 text-center text-sm text-[var(--color-ink-soft)]">
            Loading shift data…
        </div>
    ) : (
        <div className="p-3 sm:p-6">
            {/* The Day Rail above names the active step, so no duplicate step heading
                is rendered here. Floor and Settle no longer block on their own
                validation - both are directly editable and autosave (or, on a closed
                shift, wait for Review), so incomplete input just shows up as an
                incomplete number rather than a separate warning block. Review is the
                one place invalid/incomplete input is named, from the engine's own
                validations, right where the save button lives. */}

            {effectiveStep === "floor" ? (
                <FloorStep
                    allEmployees={allEmployees}
                    teams={teams}
                    setTeams={setTeams}
                    barTeam={barTeam}
                    setBarTeam={setBarTeam}
                    runners={runners}
                    setRunners={setRunners}
                    onRemoveSetupDay={shiftStatus === "setup" ? onRemoveSetupDay : undefined}
                    removingSetupDay={removingSetupDay}
                />
            ) : effectiveStep === "settle" ? (
                <SettleStep
                    closeoutGroups={closeoutGroups}
                    activeGroupId={activeGroupId}
                    onSelectGroup={handleSelectGroup}
                    poolSummary={poolSummary}
                    poolGroupCount={poolGroupCount}
                    closeReadiness={closeReadiness}
                    onMarkGroupDone={handleMarkGroupDone}
                    unmarkedCueGroupId={unmarkedCueGroupId}
                    shiftStatus={shiftStatus}
                    teams={teams}
                    barTeam={barTeam}
                    runners={runners}
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
                />
            ) : (
                <ReviewStep
                    saveFailure={saveFailure}
                    liveReview={liveReview}
                    saveBlocked={saveBlocked}
                    closeGateBlocked={closeGateBlocked}
                    closeReadiness={closeReadiness}
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
            + (effectiveStep === "settle" ? " max-[560px]:space-y-0" : " max-[560px]:space-y-2")}>
            {/* The day rail: an ordered, day-level step trail (see DayRail.jsx).
                Status is always shown; earlier/reachable steps are one tap away
                (order never forced). `onBack` is the editor exit onto this day's
                landing - leading the rail so it is reachable from every step and
                every width, including a phone with no sidebar. */}
            <DayRail steps={railSteps} onStepClick={goToStep} onBack={onBackToLanding} />

            <div>
                {stepContent}
            </div>
        </div>
    );
}

export default ShiftEditorPanel;
