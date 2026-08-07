export const toMoney = (value) => Number(value) || 0;
export const hasNegative = (value) => Number(value) < 0;

const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

export const fmtMoney = (value) => moneyFormatter.format(toMoney(value));

export const getPayoutNonCashTotal = (payout = {}) =>
    toMoney(payout.tips ?? payout.ctp ?? payout.payoutAmount) + toMoney(payout.gratuity ?? payout.grt);

export const roleLabels = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

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
