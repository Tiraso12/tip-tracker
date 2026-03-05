/**
 * distributionUtils.js
 * 
 * Core engine for calculating tip/gratuity/cash payouts per employee.
 * 
 * Team structure:
 *  - 3 Restaurant Teams: each has Captain (4pts), Server (4pts), B Server (2.5pts), A Server (2pts)
 *  - 1 Bar Team: Bartenders split equally (no point system)
 *  - Runners: flat $80 each, cost split equally across all 4 teams
 *  - Wine bonus: 1% of wine sales split equally among all Captains working
 */

export const ROLE_POINTS = {
    captain: 4,
    server: 4,
    'b-server': 2.5,
    'a-server': 2,
    bartender: null,  // bar uses equal split
    runner: null,     // flat rate
};

export const RUNNER_FLAT_RATE = 80;
export const WINE_CAPTAIN_PERCENT = 0.01; // 1% of wine sales
export const CONTRACT_POOL_PERCENT = 0.18; // 18% of contract grat enters the pool

/**
 * Calculate total points for a team (restaurant only, no runners/bartenders)
 * @param {Array} members - [{name, role, uid}]
 * @returns {number}
 */
function calcTeamPoints(members) {
    return members.reduce((sum, m) => {
        const pts = ROLE_POINTS[m.role] ?? 0;
        return sum + pts;
    }, 0);
}

/**
 * Main distribution function.
 *
 * @param {Object} params
 * @param {Array}  params.restaurantTeams  - Array of 3 teams, each: { teamId, members: [{uid, name, role}] }
 * @param {Array}  params.barTeam          - Array of bartenders: [{uid, name, role: 'bartender'}]
 * @param {Array}  params.runners          - Array of runners: [{uid, name, role: 'runner'}]
 * @param {number} params.totalTips        - Total tip pool (all teams combined, already includes contract share if applicable)
 * @param {number} params.totalGratuity    - Total gratuity pool
 * @param {number} params.totalCash        - Total cash pool
 * @param {number} params.wineAmount       - Total wine sales amount
 * @param {number} params.liquorAmount     - Total liquor sales (tracked, not distributed yet)
 * @param {boolean} params.isContract      - Whether this is a contract shift
 * @param {number}  params.contractGratAmount - The 26% contract grat amount (admin inputs directly)
 *
 * @returns {Object} { payouts: {[uid]: {name, role, tips, gratuity, cash, wineBonus, total}}, summary }
 */
export function calculateDistribution({
    restaurantTeams = [],
    barTeam = [],
    runners = [],
    totalTips,
    totalGratuity,
    totalCash,
    wineAmount = 0,
    liquorAmount = 0,
    isContract = false,
    contractGratAmount = 0,
}) {
    const payouts = {};

    // --- Contract gratuity adjustment ---
    let contractPoolShare = 0;
    let contractRemainder = 0;
    if (isContract && contractGratAmount > 0) {
        contractPoolShare = contractGratAmount * CONTRACT_POOL_PERCENT;
        contractRemainder = contractGratAmount - contractPoolShare;
        // Add the 18% into the gratuity pool
        totalGratuity = (totalGratuity || 0) + contractPoolShare;
    }

    // --- Runner deduction from tip pool ---
    const runnerCount = runners.length;
    const totalRunnerCost = runnerCount * RUNNER_FLAT_RATE;
    const numTeams = restaurantTeams.length + (barTeam.members?.length > 0 || barTeam.length > 0 ? 1 : 0);

    // Pay out runners
    runners.forEach((runner) => {
        payouts[runner.uid] = {
            name: runner.name,
            role: 'runner',
            tips: RUNNER_FLAT_RATE,
            gratuity: 0,
            cash: 0,
            wineBonus: 0,
            total: RUNNER_FLAT_RATE,
        };
    });

    // --- Wine bonus for Captains ---
    const allCaptains = restaurantTeams
        .flatMap((t) => t.members)
        .filter((m) => m.role === 'captain');
    const wineBonusPerCaptain =
        allCaptains.length > 0 ? (wineAmount * WINE_CAPTAIN_PERCENT) / allCaptains.length : 0;

    // Runner cost per team — deducted equally from each team's tip pool
    const runnerCostPerTeam = numTeams > 0 ? totalRunnerCost / numTeams : 0;

    // --- Restaurant Teams distribution (each team uses its own pool) ---
    restaurantTeams.forEach((team) => {
        const teamTips = (Number(team.pools?.tips) || 0) - runnerCostPerTeam;
        const teamGrat = Number(team.pools?.gratuity) || 0;
        const teamCash = Number(team.pools?.cash) || 0;

        const pointMembers = team.members.filter(
            (m) => m.role !== 'runner' && ROLE_POINTS[m.role] != null
        );
        const totalPoints = calcTeamPoints(pointMembers);

        pointMembers.forEach((member) => {
            const pts = ROLE_POINTS[member.role] ?? 0;
            const share = totalPoints > 0 ? pts / totalPoints : 0;

            const tipShare = teamTips * share;
            const gratShare = teamGrat * share;
            const cashShare = teamCash * share;
            const wineBonus = member.role === 'captain' ? wineBonusPerCaptain : 0;

            if (!payouts[member.uid]) {
                payouts[member.uid] = {
                    name: member.name,
                    role: member.role,
                    teamId: team.teamId,
                    tips: 0,
                    gratuity: 0,
                    cash: 0,
                    wineBonus: 0,
                    total: 0,
                };
            }
            payouts[member.uid].tips += tipShare;
            payouts[member.uid].gratuity += gratShare;
            payouts[member.uid].cash += cashShare;
            payouts[member.uid].wineBonus += wineBonus;
            payouts[member.uid].total =
                payouts[member.uid].tips +
                payouts[member.uid].gratuity +
                payouts[member.uid].cash +
                payouts[member.uid].wineBonus;
        });
    });

    // --- Bar Team distribution (equal split using bar's own pool) ---
    if (barTeam.length > 0) {
        const barTipPool = (Number(barTeam.pools?.tips) || 0) - runnerCostPerTeam;
        const barGratPool = Number(barTeam.pools?.gratuity) || 0;
        const barCashPool = Number(barTeam.pools?.cash) || 0;
        const perBartender = barTeam.members?.length || barTeam.length;
        const barMembers = barTeam.members || barTeam;

        barMembers.forEach((bartender) => {
            payouts[bartender.uid] = {
                name: bartender.name,
                role: 'bartender',
                teamId: 'bar',
                tips: perBartender > 0 ? barTipPool / perBartender : 0,
                gratuity: perBartender > 0 ? barGratPool / perBartender : 0,
                cash: perBartender > 0 ? barCashPool / perBartender : 0,
                wineBonus: 0,
                total: 0,
            };
            payouts[bartender.uid].total =
                payouts[bartender.uid].tips +
                payouts[bartender.uid].gratuity +
                payouts[bartender.uid].cash;
        });
    }

    // --- Summary ---
    const summary = {
        totalTipsDistributed: totalTips,
        totalGratuityDistributed: totalGratuity,
        totalCashDistributed: totalCash,
        runnerCostTotal: totalRunnerCost,
        wineBonusTotal: wineAmount * WINE_CAPTAIN_PERCENT,
        liquorAmount, // tracked, distribution TBD
        isContract,
        contractGratAmount,
        contractPoolShare: round2(contractPoolShare),
        contractRemainder: round2(contractRemainder), // 82% — displayed as info
    };

    // Round all payout values to 2 decimals
    Object.values(payouts).forEach((p) => {
        p.tips = round2(p.tips);
        p.gratuity = round2(p.gratuity);
        p.cash = round2(p.cash);
        p.wineBonus = round2(p.wineBonus);
        p.total = round2(p.total);
    });

    return { payouts, summary };
}

function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
