/**
 * distributionUtils.js
 *
 * Core engine for calculating tip/gratuity/cash payouts per employee.
 *
 * Pool structure:
 *  - Restaurant pool: ALL restaurant teams share ONE combined pool, distributed by points.
 *      Captain (4pts), Server (4pts), Back (2.5pts), Assistant (2pts)
 *  - Bar pool: Bartenders get their own separate pool, split equally.
 *  - Runners: flat $80 each, deducted from the restaurant tip pool before distribution.
 *  - Wine bonus: 1% of wine sales split equally among all Captains working.
 *  - Contract shift: Bar team joins the restaurant pool (their pool is merged in).
 */

export const ROLE_POINTS = {
    captain: 4,
    server: 4,
    back: 2.5,
    assistant: 2,
    bartender: null,  // normally equal split; in contract mode uses custom pts (default 4)
    runner: null,     // flat rate
};

export const RUNNER_FLAT_RATE = 102;
export const WINE_CAPTAIN_PERCENT = 0.01;   // 1% of wine sales → Captains

// By default, a contract represents a 26% service charge total.
// A variable portion (default 18) goes to the pool; the rest remains separate.

/**
 * Main distribution function.
 *
 * @param {Object} params
 * @param {Array}  params.restaurantTeams    - [{teamId, members: [{uid, name, role, points?}], pools: {tips, gratuity, cash}}]
 * @param {Object} params.barTeam            - { members: [{uid, name, role}], pools: {tips, gratuity, cash} }
 * @param {Array}  params.runners            - [{uid, name, role: 'runner'}]
 * @param {number} params.wineAmount         - Total wine sales
 * @param {number} params.liquorAmount       - Total liquor sales (tracked, not distributed yet)
 * @param {Array}  params.contracts           - [{id, gratAmount, includeBarInPool}] — all contracts for the shift
 *
 * @returns {{ payouts: {[uid]: {name, role, tips, gratuity, cash, wineBonus, total}}, summary }}
 */
export function calculateDistribution({
    restaurantTeams = [],
    barTeam = { members: [], pools: { tips: 0, gratuity: 0, cash: 0 } },
    runners = [],
    wineAmount = 0,
    liquorAmount = 0,
    contracts = [],          // new: array of contract objects
    // legacy single-contract fallback
    isContract = false,
    includeBarInPool = false,
    contractGratAmount = 0,
}) {
    const payouts = {};

    // ── Normalise contracts list ────────────────────────────────────────────────
    // Support both old single-contract fields AND the new contracts array.
    const allContracts = contracts.length > 0
        ? contracts
        : (isContract && contractGratAmount > 0
            ? [{ id: 'legacy', gratAmount: contractGratAmount, includeBarInPool }]
            : []);

    // ── 1. Aggregate contract pool contributions ─────────────────────────────────
    let contractPoolShare = 0;
    let contractRemainder = 0;
    let anyBarIncluded = includeBarInPool; // legacy fallback
    allContracts.forEach(c => {
        const amount = Number(c.gratAmount) || 0;
        const poolFraction = (Number(c.poolPercent ?? 18)) / 26;
        const share = amount * poolFraction;
        contractPoolShare += share;
        contractRemainder += amount - share; // this is the remaining portion (e.g. 8/26)
        if (c.includeBarInPool) anyBarIncluded = true;
    });
    const effectiveIncludeBar = anyBarIncluded;

    // ── 2. Pay runners flat rate ────────────────────────────────────────────────
    const totalRunnerCost = runners.length * RUNNER_FLAT_RATE;
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

    // ── 3. Build the combined restaurant pool ───────────────────────────────────
    // Tips, gratuity, and cash from ALL restaurant sections summed into one pool.
    const restTipsRaw = restaurantTeams.reduce((s, t) => s + (Number(t.pools?.tips) || 0), 0);
    const restGrat = restaurantTeams.reduce((s, t) => s + (Number(t.pools?.gratuity) || 0), 0);
    const restCash = restaurantTeams.reduce((s, t) => s + (Number(t.pools?.cash) || 0), 0);
    const restSales = restaurantTeams.reduce((s, t) => s + (Number(t.pools?.sales) || 0), 0);

    // Bar pools (kept separate unless contract)
    const barPools = barTeam.pools || {};
    const barTipsRaw = Number(barPools.tips) || 0;
    const barGrat = Number(barPools.gratuity) || 0;
    const barCash = Number(barPools.cash) || 0;
    const barMembers = barTeam.members || [];

    // Bar pools merge into restaurant pool when any contract includes bar, or legacy flag set
    const mergedTipsRaw = restTipsRaw + (effectiveIncludeBar ? barTipsRaw : 0);
    const mergedGrat = restGrat + (effectiveIncludeBar ? barGrat : 0) + contractPoolShare;
    const mergedCash = restCash + (effectiveIncludeBar ? barCash : 0);

    // Runner cost deducted from the restaurant (merged) tip pool
    const mergedTips = mergedTipsRaw - totalRunnerCost;

    // ── 4. Build restaurant participant list ────────────────────────────────────
    const allRestMembers = restaurantTeams.flatMap((t) => t.members);

    // Include bar in restaurant pool when effectiveIncludeBar is true
    const restaurantParticipants = effectiveIncludeBar
        ? [...allRestMembers, ...barMembers]
        : allRestMembers;

    // Only point-based roles participate (runners excluded; bartenders only when bar is merged)
    const pointMembers = restaurantParticipants.filter((m) => {
        if (m.role === 'runner') return false;
        if (m.role === 'bartender') return effectiveIncludeBar;
        return true;
    });

    // ── 5. Distribute restaurant pool by points ─────────────────────────────────
    // Uses custom points if set (partial-shift override), else falls back to role defaults.
    // Bartenders in contract mode default to 4pts if not manually overridden.
    const getPoints = (m) =>
        m.points ?? (m.role === 'bartender' ? 4 : (ROLE_POINTS[m.role] ?? 0));

    const totalRestPoints = pointMembers.reduce((sum, m) => sum + getPoints(m), 0);

    // Wine bonus: 1% of wine sales split equally among all captains
    const allCaptains = allRestMembers.filter((m) => m.role === 'captain');
    const wineBonusPerCaptain =
        allCaptains.length > 0
            ? (wineAmount * WINE_CAPTAIN_PERCENT) / allCaptains.length
            : 0;

    pointMembers.forEach((member) => {
        const pts = getPoints(member);
        const share = totalRestPoints > 0 ? pts / totalRestPoints : 0;

        const tipShare = mergedTips * share;
        const gratShare = mergedGrat * share;
        const cashShare = mergedCash * share;
        const wineBonus = member.role === 'captain' ? wineBonusPerCaptain : 0;

        if (!payouts[member.uid]) {
            payouts[member.uid] = {
                name: member.name,
                role: member.role,
                points: pts,
                tips: 0, gratuity: 0, cash: 0, wineBonus: 0, total: 0,
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

    // ── 6. Bar team: equal split from its own pool (only when NOT merged into restaurant) ──
    if (!effectiveIncludeBar && barMembers.length > 0) {
        const n = barMembers.length;
        barMembers.forEach((bartender) => {
            payouts[bartender.uid] = {
                name: bartender.name,
                role: bartender.role,
                points: "Equal",
                tips: n > 0 ? barTipsRaw / n : 0,
                gratuity: n > 0 ? barGrat / n : 0,
                cash: n > 0 ? barCash / n : 0,
                wineBonus: 0,
                total: 0,
            };
            payouts[bartender.uid].total =
                payouts[bartender.uid].tips +
                payouts[bartender.uid].gratuity +
                payouts[bartender.uid].cash;
        });
    }

    // ── 7. Round all values to 2 decimals ──────────────────────────────────────
    Object.values(payouts).forEach((p) => {
        p.tips = round2(p.tips);
        p.gratuity = round2(p.gratuity);
        p.cash = round2(p.cash);
        p.wineBonus = round2(p.wineBonus);
        p.total = round2(p.total);
    });

    const summary = {
        restaurantTipsPool: round2(mergedTips),
        restaurantGratPool: round2(mergedGrat),
        restaurantCashPool: round2(mergedCash),
        contracts: allContracts,
        contractGratTotal: round2(allContracts.reduce((s, c) => s + (Number(c.gratAmount) || 0), 0)),
        barTipsPool: effectiveIncludeBar ? 0 : round2(barTipsRaw),
        barGratPool: effectiveIncludeBar ? 0 : round2(barGrat),
        runnerCostTotal: round2(totalRunnerCost),
        wineBonusTotal: round2(wineAmount * WINE_CAPTAIN_PERCENT),
        totalRevenue: round2(restSales + wineAmount + liquorAmount + (Number(barPools.sales) || 0)),
        liquorAmount,
        isContract,
        contractGratAmount,
        contractPoolShare: round2(contractPoolShare),
        contractRemainder: round2(contractRemainder),
    };

    return { payouts, summary };
}

function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
