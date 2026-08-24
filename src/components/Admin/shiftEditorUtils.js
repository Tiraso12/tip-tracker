// Explicit .js extension: this module is unit-tested under `node --test`, which does
// not resolve extensionless specifiers the way Vite does (engine.js does the same).
import { ROLE_POINTS, RUNNER_FLAT_RATE, RUNNERS_FEE_FOOD_SALES_RATE } from "../../utils/constants.js";
import { getGroupCloseState } from "../../utils/settleStatus.js";

export const toMoney = (value) => Number(value) || 0;
export const hasNegative = (value) => Number(value) < 0;

const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

export const fmtMoney = (value) => moneyFormatter.format(toMoney(value));

// Digits only, always exactly two decimals, no currency glyph. The Review spot-check
// renders the "$" as its own small muted element so it can float beside the digits
// instead of occupying a column - a pinned "$" misaligns a 3-digit figure against a
// 2-digit one, and the whole card depends on the decimal points lining up.
const amountFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export const fmtAmount = (value) => amountFormatter.format(Math.abs(toMoney(value)));
export const isNegativeMoney = (value) => toMoney(value) < 0;

export const getPayoutNonCashTotal = (payout = {}) =>
    toMoney(payout.tips ?? payout.ctp ?? payout.payoutAmount) + toMoney(payout.gratuity ?? payout.grt);

// Who the Review spot-check compares against the restaurant's spreadsheet.
//
// Captains sit at the top of the restaurant's own sheet, so the captain reads one from
// there - but a captain who left early carries fewer points and therefore takes home
// less, which would read as a mismatch against a sheet whose captain worked the full
// night. So the subject is the first captain at FULL point weighting, not merely the
// first row. When no captain is at full points we still fall back rather than showing
// nothing, and the caller surfaces `atFullPoints` so a partial subject is visible
// rather than silent. The card always displays the point weighting, which is what
// makes that fallback safe.
export function selectSpotCheckSubject(payoutRows = []) {
    const captains = payoutRows.filter(payout => payout.role === "captain");
    const fullPointCaptain = captains.find(payout => toMoney(payout.points) >= ROLE_POINTS.captain);

    if (fullPointCaptain) {
        return { payout: fullPointCaptain, atFullPoints: true, isCaptain: true };
    }
    if (captains.length > 0) {
        return { payout: captains[0], atFullPoints: false, isCaptain: true };
    }
    if (payoutRows.length > 0) {
        return { payout: payoutRows[0], atFullPoints: false, isCaptain: false };
    }
    return null;
}

export const ignoreMissingUserDoc = (error) => {
    if (error?.code !== "not-found") {
        throw error;
    }
};

export function getContractTotal(team) {
    return (team.contracts || []).reduce((sum, contract) => sum + toMoney(contract.gratuity), 0);
}

export function getTeamSummary(team) {
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
        payoutPool: tips + gratuity + contractTotal,
    };
}

export function getBarSummary(barTeam) {
    const pools = barTeam.pools || {};
    const tips = toMoney(pools.tips);
    const gratuity = toMoney(pools.gratuity);

    return {
        sales: toMoney(pools.sales),
        tips,
        gratuity,
        covers: toMoney(pools.covers),
        foodSales: toMoney(pools.foodSales),
        runnerTransfer: toMoney(pools.runners),
        payoutPool: tips + gratuity,
    };
}

// Descriptors for the Settle up switcher + the day landing's who's-left checklist:
// one entry per dining team, then Bar, then Runners, each carrying the display
// name, roster sub-line, live pool, and both the money-in status and the
// close-readiness status (see settleStatus.js). Pulled out of ShiftEditorPanel
// so the day landing can build the exact same read-only rows without opening
// the editor - see docs on Direction A's "reused read-only on the day landing".
//
// Runners is hardcoded `markedDone: true` / `status: "done"` - it is excluded
// from the close gate by construction (kind "runners"), not merely defaulted,
// so a caller cannot accidentally start gating it by trusting a computed value.
export function buildCloseoutGroups({ teams = [], barTeam = { members: [], pools: {} }, runners = [] } = {}) {
    const teamGroups = teams.map((team, index) => {
        const summary = getTeamSummary(team);
        const pool = summary.payoutPool;
        const hasPeople = team.members.length > 0;
        const hasOtherInput = toMoney(team.pools?.sales) > 0
            || toMoney(team.pools?.cash) > 0
            || toMoney(team.pools?.covers) > 0;
        const markedDone = Boolean(team.markedDone);
        return {
            id: team.teamId,
            kind: "dining",
            name: `Team ${index + 1}`,
            sub: `${team.members.length} ${team.members.length === 1 ? "member" : "members"}`,
            poolLabel: "Pool",
            pool,
            hasPeople,
            hasOtherInput,
            markedDone,
            status: getGroupCloseState({ hasPeople, pool, hasOtherInput, markedDone }),
            teamIndex: index,
        };
    });

    const barSummary = getBarSummary(barTeam);
    const barPool = barSummary.payoutPool;
    const barHasPeople = barTeam.members.length > 0;
    const barHasOtherInput = toMoney(barTeam.pools?.sales) > 0
        || toMoney(barTeam.pools?.covers) > 0
        || toMoney(barTeam.pools?.foodSales) > 0;
    const barMarkedDone = Boolean(barTeam.markedDone);

    const runnerPool = runners.reduce((sum, runner) => sum + toMoney(runner.payoutAmount || RUNNER_FLAT_RATE), 0);

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
            hasOtherInput: barHasOtherInput,
            markedDone: barMarkedDone,
            status: getGroupCloseState({ hasPeople: barHasPeople, pool: barPool, hasOtherInput: barHasOtherInput, markedDone: barMarkedDone }),
        },
        {
            id: "runners",
            kind: "runners",
            name: "Runners",
            sub: `${runners.length} ${runners.length === 1 ? "runner" : "runners"}`,
            poolLabel: "Pay",
            pool: runnerPool,
            hasPeople: runners.length > 0,
            hasOtherInput: false,
            markedDone: true,
            status: "done",
        },
    ];
}

// Friendly entry (2026-08-24 lock, Path 3): which group, if any, the signed-in
// viewer is assigned to on tonight's floor plan - so the day landing can pin
// "your team" with a one-tap Settle up instead of asking a question the floor
// plan already answers. Scans dining teams then Bar; a captain covering more
// than one group (should not happen, but the floor plan doesn't forbid it)
// resolves to the first match, same left-to-right order the checklist itself
// reads in. Runners is deliberately never scanned - it is always Done, so
// there is nothing to pin a Runner to.
export function findViewerGroup(lineup, uid) {
    if (!uid) return null;
    const teams = lineup?.teams || [];
    for (const team of teams) {
        const member = (team.members || []).find(m => m.uid === uid);
        if (member) return { groupId: team.teamId, role: member.role };
    }
    const barMember = (lineup?.barTeam?.members || []).find(m => m.uid === uid);
    if (barMember) return { groupId: "bar", role: barMember.role };
    return null;
}

// ---- The bar's Runners Fee and the food sales it comes from ----
//
// The fee IS 3% of the bar's total food sales, but the AMOUNT is the field the
// captain's managers type into: the rate varies at their discretion and they express
// that by adjusting the amount. So food sales PREFILLS the fee and never governs it,
// and everything below is that one relationship, kept pure and out of the component.
//
// There is no stored "was this edited" flag, deliberately. Overridden is derived by
// comparing the two numbers that are already saved, which settles the awkward case by
// itself: a shift from before food sales existed has no figure to derive from, so it
// reads as neither derived nor overridden and stays quiet rather than being marked
// "edited" for having been typed under the old model.

const feeRounded = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const isBlank = (value) => value === "" || value === null || value === undefined;

export const deriveRunnersFee = (foodSales) =>
    feeRounded(toMoney(foodSales) * RUNNERS_FEE_FOOD_SALES_RATE);

// A bar with no food sales figure has nothing to derive a fee from - the pair is
// simply not in play, which is exactly the state every shift settled before this
// field existed is in.
export const hasBarFoodSales = (pools = {}) => !isBlank(pools.foodSales) && toMoney(pools.foodSales) > 0;

// Is the fee still the derived 3%, to the cent? Blank food sales makes this false
// rather than throwing the question away: there is no computed value to sit at.
export function isRunnersFeeDerived(pools = {}) {
    if (!hasBarFoodSales(pools)) return false;
    return Math.abs(toMoney(pools.runners) - deriveRunnersFee(pools.foodSales)) < 0.005;
}

// The one signal the captain asked for: the fee was set by hand. Quiet in the normal
// case (a fee sitting at the computed 3%) and quiet with no food sales figure at all.
export function isRunnersFeeOverridden(pools = {}) {
    if (!hasBarFoodSales(pools)) return false;
    return !isRunnersFeeDerived(pools);
}

// Food sales changed - re-derive the fee, but only while the fee is TRACKING the
// derivation. A fee that already disagrees with 3% of the old figure is somebody's
// deliberate amount, so it is left exactly as typed; that is what keeps a re-opened
// historical shift honest, because entering food sales against a fee that was typed
// blind under the old model must not silently move that night's money.
export function applyBarFoodSalesEdit(pools = {}, nextFoodSales) {
    const tracking = isBlank(pools.runners) || isRunnersFeeDerived(pools)
        // No prior food sales figure: only a blank/zero fee is tracking, since any
        // real amount was entered by hand rather than derived.
        || (!hasBarFoodSales(pools) && toMoney(pools.runners) === 0);

    if (!tracking) return { ...pools, foodSales: nextFoodSales };

    // Clearing food sales clears the fee with it - the two move as a pair while the
    // fee is derived, and leaving a stale 3% of a number no longer on screen behind
    // would read as a hand-entered amount.
    const nextRunners = isBlank(nextFoodSales) ? "" : String(deriveRunnersFee(nextFoodSales));

    return { ...pools, foodSales: nextFoodSales, runners: nextRunners };
}

// Everyone this night records at a negative amount, for the screen that has to say so.
//
// A negative is CORRECT and must never be blocked: the bar's Runners Fee comes out of
// CTP, so a night whose money all arrives as gratuity (a contract with no charged tip)
// leaves the CTP side negative. It resolves across the week, where the CTP total nets
// the negative night against the positive ones. What is owed is honesty about it, so
// this names the people rather than the pool.
//
// The test is the night's total (CTP + GRT), which is what the person is recorded at.
// A negative CTP covered by that night's gratuity leaves them paid, and saying "you
// are negative" over a positive take-home would be the false alarm.
export function selectNegativePayouts(payoutRows = []) {
    return payoutRows
        .filter(payout => getPayoutNonCashTotal(payout) < 0)
        .map(payout => ({
            uid: payout.uid,
            name: payout.name || "Unknown",
            role: payout.role,
            total: getPayoutNonCashTotal(payout),
        }));
}

// Which CTP pools this night drove below zero, read off the engine's own adjusted pools
// (`engine.js` §6) rather than re-derived here.
//
// This is a SEPARATE question from `selectNegativePayouts` above and the two do not
// imply each other. A pool is negative before it is split; a person's recorded amount
// nets that night's CTP against its GRT. On a contract-heavy night the CTP pool goes
// under while every share still lands positive, so the pool is the only thing negative -
// and the notice would have said nothing at all if it only ever looked at people. That
// blind spot is why these figures are surfaced instead of the engine's red warning
// strings, which said the same fact in the vocabulary of a fault.
//
// `engine.js` emits those strings regardless and still does: they are part of a saved
// summary and are pinned by its tests. This only decides what a screen shows.
const NEGATIVE_POOL_FIELDS = [
    { key: "adjustedBarCTPPool", label: "Bar CTP" },
    { key: "adjustedTeamCTPPool", label: "Dining Room CTP" },
];

export function selectNegativePools(adjustedPools = {}) {
    return NEGATIVE_POOL_FIELDS
        // Absent is not negative. Ledger docs written before `adjustedPools` existed have
        // no figure to judge, and a missing key must read as "nothing to say" rather than
        // as a zero that could never be below it.
        .filter(({ key }) => adjustedPools?.[key] !== undefined && toMoney(adjustedPools[key]) < 0)
        .map(({ key, label }) => ({ key, label, total: toMoney(adjustedPools[key]) }));
}

// The engine's two negative-pool warnings, dropped from a list bound for a red
// "Warnings" block. They are not deleted from the summary and nothing stops being
// checked - `NegativeNightNotice` states the same fact in neutral words, and a correct
// night was being reported twice, once as a fault. Every other validation is untouched,
// including the negative RUNNER PAYOUT warning, which is a different condition.
const NEGATIVE_POOL_WARNING = /CTP pool is negative/i;

export function withoutNegativePoolWarnings(validations = []) {
    return validations.filter(validation => !NEGATIVE_POOL_WARNING.test(String(validation)));
}

export function validateShiftInputs({ teams, barTeam, runners }) {
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

    // Paired with the captain's own words for each field, not the storage key: the
    // fee's key is `runners` and the food sales key is `foodSales`, neither of which
    // reads as English in "Bar ___ cannot be negative."
    const barPools = barTeam.pools || {};
    [
        ["sales", "sales"],
        ["tips", "tips"],
        ["gratuity", "gratuity"],
        ["foodSales", "food sales"],
        ["runners", "runners fee"],
    ].forEach(([field, label]) => {
        if (hasNegative(barPools[field])) errors.push(`Bar ${label} cannot be negative.`);
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

export function getAssignedCount({ teams, barTeam, runners }) {
    return teams.reduce((sum, team) => sum + team.members.length, 0)
        + barTeam.members.length
        + runners.length;
}

export function validateTeamSetup({ teams, barTeam, runners }) {
    if (getAssignedCount({ teams, barTeam, runners }) === 0) {
        return ["Assign at least one employee before saving the team setup."];
    }

    return [];
}

export function mapPayoutsForFirebase(result) {
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
                total: p.total !== undefined ? p.total : (p.payoutAmount || 0),
                teamId: p.teamId || null,
                breakdown: p.breakdown || {},
                payoutAmount: p.payoutAmount || null,
            };
        });
    };

    if (result.payouts?.roleGrouped) {
        attachToMapped(result.payouts.roleGrouped.captains, "captain");
        attachToMapped(result.payouts.roleGrouped.servers, "server");
        attachToMapped(result.payouts.roleGrouped.backs, "back");
        attachToMapped(result.payouts.roleGrouped.assistants, "assistant");
        attachToMapped(result.payouts.roleGrouped.bar, "bartender");
        attachToMapped(result.payouts.roleGrouped.runners, "runner");
    }

    return mappedPayoutsForFirebase;
}

export function buildPayoutReview(result, mappedPayouts) {
    const payoutRows = Object.entries(mappedPayouts)
        .map(([uid, payout]) => ({ uid, ...payout }))
        .sort((a, b) => {
            const roleOrder = ["captain", "server", "back", "assistant", "bartender", "runner"];
            const roleDiff = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
            if (roleDiff !== 0) return roleDiff;
            return (a.name || "").localeCompare(b.name || "");
        });

    return {
        result,
        mappedPayouts,
        payoutRows,
        staffTotal: payoutRows.reduce((sum, payout) => sum + getPayoutNonCashTotal(payout), 0),
    };
}
