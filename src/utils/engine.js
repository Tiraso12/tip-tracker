/**
 * engine.js
 * 
 * Pure calculation engine for Tip-Out app payouts.
 * 
 * This module has no UI dependencies. It takes flattened shift inputs 
 * and returns calculated point values, allocations, and individual payouts, 
 * along with a double-entry balance check.
 */

export const ROLE_POINTS = {
    captain: 4,
    front: 4,
    back: 2.5,
    busser: 2,
};

export const LEGACY_ROLE_MAP = {
    server: 'front',
    assistant: 'busser'
};

const n = (val) => Number(val) || 0;
const r2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const sumProp = (arr, prop) => arr.reduce((sum, item) => sum + n(item[prop]), 0);

export function calculateShift(inputs) {
    const config = {
        teams: [],
        barTeam: { members: [], pools: {} },
        barSales: 0,
        ctpTotal: 0,
        cashTotal: 0,
        contract26Gratuity: 0,
        defaultRunnerSource: 'Team CTP',
        barMembers: [],
        runners: [],
        ...inputs
    };

    // Backwards compat for old shift schemas
    if (config.barTeam.members.length === 0 && config.barMembers.length > 0) {
        config.barTeam.members = config.barMembers;
    }

    const validations = [];

    // 1. DERIVED VALUES
    const isNewFormat = config.teams.length > 0 && config.teams[0].pools !== undefined;

    const totalTeamSales = config.teams.reduce((sum, t) => sum + Math.max(0, n(t.pools?.sales) || n(t.teamSales)), 0);
    const totalTeamCTP = config.teams.reduce((sum, t) => sum + Math.max(0, n(t.pools?.tips)), 0);
    const totalTeamCash = config.teams.reduce((sum, t) => sum + Math.max(0, n(t.pools?.cash)), 0);
    const totalTeamGrt = config.teams.reduce((sum, t) => sum + Math.max(0, n(t.pools?.gratuity)), 0);
    const teamContractGratTotal = config.teams.reduce((sum, t) => sum + Math.max(0, n(t.pools?.contract26Gratuity)), 0);

    const barSales = Math.max(0, n(config.barTeam.pools?.sales) || n(config.barSales));
    const barCTP = Math.max(0, n(config.barTeam.pools?.tips));
    const barGRT = Math.max(0, n(config.barTeam.pools?.gratuity));

    // If new format is active, firmly ignore global inputs to prevent ghost totals
    const baseTeamCTP = isNewFormat ? totalTeamCTP : n(config.ctpTotal);
    const ctpTotal = baseTeamCTP + barCTP;

    const baseTeamCash = isNewFormat ? totalTeamCash : n(config.cashTotal);
    const cashTotal = baseTeamCash;

    const grtContractTotal = isNewFormat ? teamContractGratTotal : n(config.contract26Gratuity);

    // Total Gratuity Available (Regular + Contract)
    const grtTotalAvailable = totalTeamGrt + barGRT + grtContractTotal;

    const contractSales = grtContractTotal / 0.26 || 0;

    let regularSalesBase = totalTeamSales - contractSales;
    if (contractSales > totalTeamSales) {
        regularSalesBase = 0;
        validations.push("Warning: Contract sales exceed total team sales. Regular sales base clamped to 0.");
    }

    // 2. PRE-DISTRIBUTIONS
    const barCTPAllocation = regularSalesBase * 0.01;
    const doorCTPAllocation = regularSalesBase * 0.005;

    // Captain Override CTP is strictly derived from Regular Sales (1% of sales goes to captain)
    const captainOverrideCTP = regularSalesBase * 0.01;

    // GRT Allocations are derived from Contract Sales
    const captainOverrideGRT = contractSales * 0.01;
    const barGRTAllocation = contractSales * 0.01;
    const doorGRTAllocation = contractSales * 0.02;
    const peCoordinatorGRT = contractSales * 0.02;
    const houseAllocation = contractSales * 0.03;

    // 3. BAR POOLS
    const rawBarCTPPool = barCTP + barCTPAllocation;
    const rawBarGRTPool = barGRT + barGRTAllocation;

    // 4. TEAM POOLS
    const rawTeamCTPPool = baseTeamCTP - barCTPAllocation - doorCTPAllocation - captainOverrideCTP;
    const rawTeamCashPool = baseTeamCash;
    const rawTeamGRTPool = totalTeamGrt + grtContractTotal - barGRTAllocation - doorGRTAllocation - peCoordinatorGRT - houseAllocation - captainOverrideGRT;

    // 5. RUNNER LOGIC & DEDUCTIONS
    const runnerDeductions = {
        'Team CTP': 0,
        'Bar CTP': 0
    };

    const runnerPayouts = config.runners.map(runner => {
        let amountA = 0;
        let amountB = 0;
        let sourceA = runner.sourceA || runner.source || config.defaultRunnerSource;
        let sourceB = runner.sourceB || '';
        const payoutAmount = n(runner.payoutAmount);

        if (payoutAmount < 0) validations.push(`Warning: Runner ${runner.name || 'Unknown'} has a negative payout amount.`);
        const mode = runner.fundingSourceMode || 'single_source';

        if (mode === 'single_source' && sourceA === 'Team/Bar 50/50') {
            amountA = payoutAmount / 2;
            amountB = payoutAmount / 2;
            sourceA = 'Team CTP';
            sourceB = 'Bar CTP';
        } else if (mode === 'single_source') {
            amountA = payoutAmount;
        } else if (mode === 'amount_plus_remainder') {
            amountA = n(runner.amountFromSourceA);
            if (amountA > payoutAmount) {
                amountA = payoutAmount;
                validations.push(`Warning: Runner ${runner.name || 'Unknown'} fixed amount exceeds total payout.`);
            }
            amountB = payoutAmount - amountA;
        } else if (mode === 'percent_plus_remainder') {
            const pct = n(runner.percentFromSourceA);
            if (pct < 0 || pct > 100) validations.push(`Warning: Runner ${runner.name || 'Unknown'} percent split must be between 0 and 100.`);
            amountA = payoutAmount * (Math.max(0, Math.min(100, pct)) / 100);
            amountB = payoutAmount - amountA;
        }

        if (sourceA !== 'Team CTP' && sourceA !== 'Bar CTP') {
            validations.push(`Warning: Runner ${runner.name || 'Unknown'} has invalid sourceA: ${sourceA}. Defaulting to Team CTP.`);
            sourceA = 'Team CTP';
            if (mode === 'single_source') amountA = payoutAmount;
        }

        if (amountB > 0 && sourceB !== 'Team CTP' && sourceB !== 'Bar CTP') {
            validations.push(`Warning: Runner ${runner.name || 'Unknown'} has invalid sourceB: ${sourceB}. Defaulting to Bar CTP.`);
            sourceB = sourceA === 'Team CTP' ? 'Bar CTP' : 'Team CTP';
        }

        if ((mode === 'amount_plus_remainder' || mode === 'percent_plus_remainder') && sourceA === sourceB && amountB > 0) {
            validations.push(`Warning: Runner ${runner.name || 'Unknown'} has the same funding source for both parts of a split.`);
        }

        if (runnerDeductions[sourceA] !== undefined) runnerDeductions[sourceA] += amountA;
        if (amountB > 0 && runnerDeductions[sourceB] !== undefined) runnerDeductions[sourceB] += amountB;

        return {
            uid: runner.uid,
            name: runner.name,
            role: 'runner',
            payoutAmount: r2(payoutAmount),
            breakdown: {
                [sourceA]: r2(amountA),
                ...(amountB > 0 ? { [sourceB]: r2(amountB) } : {})
            }
        };
    });

    // 6. ADJUSTED POOLS
    const adjustedBarCTPPool = rawBarCTPPool - runnerDeductions['Bar CTP'];
    const adjustedBarGRTPool = rawBarGRTPool; // GRT is never deducted for runners

    const adjustedTeamCTPPool = rawTeamCTPPool - runnerDeductions['Team CTP'];
    const adjustedTeamCashPool = rawTeamCashPool;
    const adjustedTeamGRTPool = rawTeamGRTPool; // GRT is never deducted for runners

    if (adjustedBarCTPPool < 0) validations.push(`Warning: Bar CTP pool is negative (${r2(adjustedBarCTPPool)}). Allocations or deductions exceeded the available pool.`);
    if (adjustedTeamCTPPool < 0) validations.push(`Warning: Team CTP pool is negative (${r2(adjustedTeamCTPPool)}). Sales-based allocations or deductions exceeded the available tip pool.`);

    // 7. POINT DISTRIBUTION (BAR)
    let totalBarPoints = sumProp(config.barTeam.members, 'points');
    if (totalBarPoints <= 0 && config.barTeam.members.length > 0) {
        totalBarPoints = config.barTeam.members.length;
        config.barTeam.members.forEach(m => m.points = 1);
    }
    if (totalBarPoints === 0 && (adjustedBarCTPPool > 0 || adjustedBarGRTPool > 0)) {
        validations.push("Warning: Positive bar pools exist but there are no bar points assigned.");
    }

    const barCTPPointValue = totalBarPoints > 0 ? adjustedBarCTPPool / totalBarPoints : 0;
    const barGRTPointValue = totalBarPoints > 0 ? adjustedBarGRTPool / totalBarPoints : 0;

    const barPayouts = config.barTeam.members.map(emp => {
        const pts = n(emp.points);
        const ctp = pts * barCTPPointValue;
        const grt = pts * barGRTPointValue;
        return {
            uid: emp.uid,
            name: emp.name,
            role: 'bartender',
            points: pts,
            ctp: r2(ctp),
            grt: r2(grt),
            cash: 0,
            total: r2(ctp + grt)
        };
    });

    // 8. POINT DISTRIBUTION (TEAM) 
    // Teams are grouped. We first need total points across ALL teams to find point values.
    const allProcessedTeamMembers = [];
    const activeCaptains = [];

    const teamsProcessed = config.teams.map((team, idx) => {
        const teamDisplayName = `Team ${idx + 1}`;
        const processedMembers = (team.members || []).map(emp => {
            const standardizedRole = LEGACY_ROLE_MAP[emp.role] || emp.role;
            const pts = emp.points !== undefined && emp.points !== null && emp.points !== ""
                ? n(emp.points)
                : (ROLE_POINTS[standardizedRole] || 0);

            const m = { ...emp, points: pts, _stdRole: standardizedRole, teamId: teamDisplayName };
            allProcessedTeamMembers.push(m);

            if (standardizedRole === 'captain') {
                activeCaptains.push(m);
            }
            return m;
        });
        return { ...team, teamId: teamDisplayName, members: processedMembers };
    });

    const totalTeamPoints = sumProp(allProcessedTeamMembers, 'points');
    if (totalTeamPoints === 0 && (adjustedTeamCTPPool > 0 || adjustedTeamGRTPool > 0 || adjustedTeamCashPool > 0)) {
        validations.push("Warning: Positive team pools exist but there are no team points assigned.");
    }

    const teamCTPPointValue = totalTeamPoints > 0 ? adjustedTeamCTPPool / totalTeamPoints : 0;
    const teamCashPointValue = totalTeamPoints > 0 ? adjustedTeamCashPool / totalTeamPoints : 0;
    const teamGRTPointValue = totalTeamPoints > 0 ? adjustedTeamGRTPool / totalTeamPoints : 0;

    // 9. CAPTAIN OVERRIDE
    const captainOverrideCTPPool = captainOverrideCTP;
    const captainOverrideGRTPool = captainOverrideGRT;

    const captainCount = activeCaptains.length;
    let splitCTP = 0;
    let splitGRT = 0;
    if (captainCount > 0) {
        splitCTP = captainOverrideCTPPool / captainCount;
        splitGRT = captainOverrideGRTPool / captainCount;
    }

    // 10. GENERATE PAYOUTS 
    const teamPayouts = [];
    const roleGroupedPayouts = {
        captains: [],
        servers: [],
        backs: [],
        bussers: [],
        runners: runnerPayouts,
        bar: barPayouts
    };

    teamsProcessed.forEach(team => {
        const teamMembersPayout = team.members.map(emp => {
            let ctp = emp.points * teamCTPPointValue;
            let grt = emp.points * teamGRTPointValue;
            const cash = emp.points * teamCashPointValue;

            // Merge Captain Override directly into payout
            if (emp._stdRole === 'captain') {
                ctp += splitCTP;
                grt += splitGRT;
            }

            const payoutObj = {
                uid: emp.uid,
                name: emp.name,
                role: emp._stdRole,
                points: emp.points,
                ctp: r2(ctp),
                cash: r2(cash),
                grt: r2(grt),
                total: r2(ctp + cash + grt),
                teamId: team.teamId
            };

            // Push to correct role group
            if (emp._stdRole === 'captain') roleGroupedPayouts.captains.push(payoutObj);
            else if (emp._stdRole === 'front') roleGroupedPayouts.servers.push(payoutObj);
            else if (emp._stdRole === 'back') roleGroupedPayouts.backs.push(payoutObj);
            else if (emp._stdRole === 'busser') roleGroupedPayouts.bussers.push(payoutObj);

            return payoutObj;
        });

        teamPayouts.push({
            teamId: team.teamId,
            payouts: teamMembersPayout
        });
    });

    // 11. BALANCE CHECKS (AUDIT)
    const sumNestedPayouts = (groupedArray, key) =>
        groupedArray.reduce((total, group) => total + sumProp(group.payouts, key), 0);

    const out_TeamCASH = sumNestedPayouts(teamPayouts, 'cash');
    const out_TeamCTP = sumNestedPayouts(teamPayouts, 'ctp');
    const out_TeamGRT = sumNestedPayouts(teamPayouts, 'grt');

    const out_BarCTP = sumProp(barPayouts, 'ctp');
    const out_BarGRT = sumProp(barPayouts, 'grt');

    // Captain Overrides are now mathematically inside out_TeamCTP & out_TeamGRT, 
    // but for balance checking against pools, we extract it.
    const out_CapOverrideCTP = activeCaptains.length * splitCTP;
    const out_CapOverrideGRT = activeCaptains.length * splitGRT;

    // We must subtract the injected override from the team totals to avoid double counting the distribute sum
    const clean_TeamCTP = out_TeamCTP - out_CapOverrideCTP;
    const clean_TeamGRT = out_TeamGRT - out_CapOverrideGRT;

    const out_Runners = sumProp(runnerPayouts, 'payoutAmount');

    const out_Allocations = doorCTPAllocation + doorGRTAllocation + peCoordinatorGRT + houseAllocation;

    const totalDistributed = out_TeamCASH + clean_TeamCTP + clean_TeamGRT + out_BarCTP + out_BarGRT + out_CapOverrideCTP + out_CapOverrideGRT + out_Runners + out_Allocations;
    const totalAvailable = cashTotal + ctpTotal + grtTotalAvailable;

    const overallBalance = r2(totalAvailable - totalDistributed);
    if (Math.abs(overallBalance) > 0.05) {
        validations.push(`Balance Warning: Shift does not balance. Total Available: ${r2(totalAvailable)}, Total Distributed: ${r2(totalDistributed)}, Diff: ${overallBalance}`);
    }

    const balances = {
        poolBalances: {
            'Team CTP': r2(adjustedTeamCTPPool - clean_TeamCTP),
            'Team CASH': r2(adjustedTeamCashPool - out_TeamCASH),
            'Team GRT': r2(adjustedTeamGRTPool - clean_TeamGRT),
            'Bar CTP': r2(adjustedBarCTPPool - out_BarCTP),
            'Bar GRT': r2(adjustedBarGRTPool - out_BarGRT),
            'Cap Ov CTP': r2(captainOverrideCTPPool - out_CapOverrideCTP),
            'Cap Ov GRT': r2(captainOverrideGRTPool - out_CapOverrideGRT)
        },
        overallBalance,
        totalAvailable: r2(totalAvailable),
        totalDistributed: r2(totalDistributed)
    };

    // 12. RETURN STRUCTURE
    return {
        normalizedInputs: config,
        derivedValues: {
            totalTeamSales: r2(totalTeamSales),
            grtTotal: r2(grtTotalAvailable),
            contractSales: r2(contractSales),
            regularSalesBase: r2(regularSalesBase),
            baseTeamCTP: r2(baseTeamCTP),
            baseTeamCash: r2(baseTeamCash),
            ctpTotal: r2(ctpTotal),
            barCTP: r2(barCTP),
            grtContractTotal: r2(grtContractTotal)
        },
        allocations: {
            barCTPAllocation: r2(barCTPAllocation),
            doorCTPAllocation: r2(doorCTPAllocation),
            captainOverrideCTP: r2(captainOverrideCTP),
            barGRTAllocation: r2(barGRTAllocation),
            doorGRTAllocation: r2(doorGRTAllocation),
            peCoordinatorGRT: r2(peCoordinatorGRT),
            captainOverrideGRT: r2(captainOverrideGRT),
            houseAllocation: r2(houseAllocation)
        },
        rawPools: {
            rawTeamCTPPool: r2(rawTeamCTPPool),
            rawTeamCashPool: r2(rawTeamCashPool),
            rawTeamGRTPool: r2(rawTeamGRTPool),
            rawBarCTPPool: r2(rawBarCTPPool),
            rawBarGRTPool: r2(rawBarGRTPool)
        },
        runnerDeductionsByPool: {
            'Team CTP': r2(runnerDeductions['Team CTP']),
            'Bar CTP': r2(runnerDeductions['Bar CTP'])
        },
        adjustedPools: {
            adjustedTeamCTPPool: r2(adjustedTeamCTPPool),
            adjustedTeamCashPool: r2(adjustedTeamCashPool),
            adjustedTeamGRTPool: r2(adjustedTeamGRTPool),
            adjustedBarCTPPool: r2(adjustedBarCTPPool),
            adjustedBarGRTPool: r2(adjustedBarGRTPool)
        },
        pointTotals: {
            totalTeamPoints,
            totalBarPoints
        },
        pointValues: {
            teamCTPPointValue: r2(teamCTPPointValue),
            teamCashPointValue: r2(teamCashPointValue),
            teamGRTPointValue: r2(teamGRTPointValue),
            barCTPPointValue: r2(barCTPPointValue),
            barGRTPointValue: r2(barGRTPointValue)
        },
        payouts: {
            roleGrouped: roleGroupedPayouts,
            teamPayouts,
            barPayouts,
            runners: runnerPayouts
        },
        validations,
        balances
    };
}
