// Explicit .js extension: this module is unit-tested under `node --test`, which does
// not resolve extensionless specifiers the way Vite does (engine.js does the same).
import { ROLE_POINTS } from "../../utils/constants.js";

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
        runnerTransfer: toMoney(pools.runners),
        payoutPool: tips + gratuity,
    };
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
