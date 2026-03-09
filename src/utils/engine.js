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
    const teamContractGratTotal = config.teams.reduce((sum, t) => {
        let teamGrt = 0;
        if (t.contracts && t.contracts.length > 0) {
            teamGrt = t.contracts.reduce((cSum, c) => cSum + Math.max(0, n(c.gratuity)), 0);
        } else {
            teamGrt = Math.max(0, n(t.pools?.contract26Gratuity));
        }
        return sum + teamGrt;
    }, 0);

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
    // Bar gets 1% of Regular Sales (CTP) and 1% of Contract Sales (GRT)
    const rawBarCTPPool = barCTP + barCTPAllocation;
    const rawBarGRTPool = barGRT + barGRTAllocation;

    // 4. TEAM POOLS
    const rawTeamCTPPool = baseTeamCTP - barCTPAllocation - doorCTPAllocation - captainOverrideCTP;
    const rawTeamCashPool = baseTeamCash;
    const rawTeamGRTPool = (totalTeamGrt + grtContractTotal) - barGRTAllocation - doorGRTAllocation - peCoordinatorGRT - houseAllocation - captainOverrideGRT;

    // 5. RUNNER LOGIC & DEDUCTIONS
    const runnerDeductions = {
        'Bar CTP': 0
    };
    config.teams.forEach((_, idx) => {
        runnerDeductions[`Team ${idx + 1} CTP`] = 0;
    });

    const runnerPayouts = config.runners.map(runner => {
        let amountA = 0;
        let amountB = 0;
        let sourceA = runner.sourceA || runner.source || 'Even Split';
        let sourceB = runner.sourceB || '';
        const payoutAmount = n(runner.payoutAmount);

        if (payoutAmount < 0) validations.push(`Warning: Runner ${runner.name || 'Unknown'} has a negative payout amount.`);
        const mode = runner.fundingSourceMode || 'single_source';

        // Custom Even Split Logic
        const evenSplitBreakdown = {};
        if (mode === 'single_source' && sourceA === 'Even Split') {
            const numPools = config.teams.length + (config.barTeam.members.length > 0 ? 1 : 0);
            if (numPools > 0) {
                const splitShare = payoutAmount / numPools;
                if (config.barTeam.members.length > 0) {
                    evenSplitBreakdown['Bar CTP'] = splitShare;
                    runnerDeductions['Bar CTP'] += splitShare;
                }
                config.teams.forEach((_, idx) => {
                    evenSplitBreakdown[`Team ${idx + 1} CTP`] = splitShare;
                    runnerDeductions[`Team ${idx + 1} CTP`] += splitShare;
                });
            }
            return {
                uid: runner.uid,
                name: runner.name,
                role: 'runner',
                payoutAmount: r2(payoutAmount),
                breakdown: Object.keys(evenSplitBreakdown).reduce((acc, key) => { acc[key] = r2(evenSplitBreakdown[key]); return acc; }, {})
            };
        }

        // Standard Manual Logic
        if (mode === 'single_source') {
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

        if (runnerDeductions[sourceA] === undefined) {
            validations.push(`Warning: Runner ${runner.name || 'Unknown'} has invalid sourceA: ${sourceA}. Defaulting to Even Split.`);
            // Cannot easily default to even split mid-algorithm if modes conflict, fallback to Bar if absolutely necessary
            sourceA = 'Bar CTP';
            if (mode === 'single_source') amountA = payoutAmount;
        }

        if (amountB > 0 && runnerDeductions[sourceB] === undefined) {
            validations.push(`Warning: Runner ${runner.name || 'Unknown'} has invalid sourceB: ${sourceB}.`);
            sourceB = 'Bar CTP';
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

    if (adjustedBarCTPPool < 0) validations.push(`Warning: Bar CTP pool is negative (${r2(adjustedBarCTPPool)}). Allocations or deductions exceeded the available pool.`);

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
        const teamDedCTP = runnerDeductions[`Team ${idx + 1} CTP`] || 0;

        // Calculate specific inner pools for this team
        const loc_teamSalesBase = Math.max(0, n(team.pools?.sales) || n(team.teamSales));
        const loc_teamCTP = Math.max(0, n(team.pools?.tips));
        const loc_teamCash = Math.max(0, n(team.pools?.cash));
        const loc_teamGrt = Math.max(0, n(team.pools?.gratuity));
        let loc_teamContractGrt = 0;
        if (team.contracts && team.contracts.length > 0) {
            loc_teamContractGrt = team.contracts.reduce((cSum, c) => cSum + Math.max(0, n(c.gratuity)), 0);
        } else {
            loc_teamContractGrt = Math.max(0, n(team.pools?.contract26Gratuity));
        }

        let loc_contractSales = 0;
        if (loc_teamContractGrt > 0) {
            loc_contractSales = loc_teamContractGrt / 0.26;
        } else {
            // Re-derive proportional contract sales from total if old format
            loc_contractSales = teamContractGratTotal > 0 ? (loc_teamSalesBase / totalTeamSales) * contractSales : 0;
        }

        let loc_regSalesBase = loc_teamSalesBase - loc_contractSales;
        if (loc_contractSales > loc_teamSalesBase) loc_regSalesBase = 0;

        // Determine this specific Team's pre-distribution burden to find true starting pool
        let loc_barAlloc = loc_regSalesBase * 0.01;
        let loc_doorAlloc = loc_regSalesBase * 0.005;
        let loc_capOverrideCTP = loc_regSalesBase * 0.01;

        const loc_rawCTP = (isNewFormat ? loc_teamCTP : (loc_teamSalesBase / totalTeamSales) * baseTeamCTP) - loc_barAlloc - loc_doorAlloc - loc_capOverrideCTP;

        // This team's truly adjusted available CTP
        const loc_adjCTP = loc_rawCTP - teamDedCTP;
        if (loc_adjCTP < 0) validations.push(`Warning: ${teamDisplayName} CTP pool is negative (${r2(loc_adjCTP)}). Deductions exceeded available tips.`);

        const loc_adjCash = isNewFormat ? loc_teamCash : (loc_teamSalesBase / totalTeamSales) * baseTeamCash;

        let loc_houseGRT = 0, loc_peCoordGRT = 0, loc_doorGRT = 0, loc_barGRTAlloc = 0, loc_capOverrideGRT = 0;
        loc_houseGRT = loc_contractSales * 0.03;
        loc_peCoordGRT = loc_contractSales * 0.02;
        loc_doorGRT = loc_contractSales * 0.02;
        loc_barGRTAlloc = loc_contractSales * 0.01;
        loc_capOverrideGRT = loc_contractSales * 0.01;

        const loc_adjGRT = loc_teamGrt + loc_teamContractGrt - loc_houseGRT - loc_peCoordGRT - loc_doorGRT - loc_barGRTAlloc - loc_capOverrideGRT;

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

        // Calculate point values purely for THIS team
        const teamPts = processedMembers.reduce((sum, m) => sum + m.points, 0);

        return {
            ...team,
            teamId: teamDisplayName,
            members: processedMembers,
            loc_adjCTP,
            loc_adjCash,
            loc_adjGRT,
            teamPts
        };
    });



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
    const totalAdjTeamCTP = teamsProcessed.reduce((sum, t) => sum + t.loc_adjCTP, 0);
    const totalAdjTeamCash = teamsProcessed.reduce((sum, t) => sum + t.loc_adjCash, 0);
    const totalAdjTeamGRT = teamsProcessed.reduce((sum, t) => sum + t.loc_adjGRT, 0);
    const totalAllTeamPoints = teamsProcessed.reduce((sum, t) => sum + t.teamPts, 0);

    const globalTeamCTPPointValue = totalAllTeamPoints > 0 ? totalAdjTeamCTP / totalAllTeamPoints : 0;
    const globalTeamCashPointValue = totalAllTeamPoints > 0 ? totalAdjTeamCash / totalAllTeamPoints : 0;
    const globalTeamGRTPointValue = totalAllTeamPoints > 0 ? totalAdjTeamGRT / totalAllTeamPoints : 0;

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
            let ctp = emp.points * globalTeamCTPPointValue;
            let grt = emp.points * globalTeamGRTPointValue;
            const cash = emp.points * globalTeamCashPointValue;

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

    // The global balance check should simply be:
    // Total Available (Input) - Total Distributed (Everyone's Payouts + External Fees)
    const totalPaymentsToStaff = out_TeamCASH + out_TeamCTP + out_TeamGRT + out_BarCTP + out_BarGRT + out_Runners;
    const totalExternalFees = doorCTPAllocation + doorGRTAllocation + peCoordinatorGRT + houseAllocation;

    // Note: Captain Overrides are ALREADY included inside out_TeamCTP/GRT since we merged them in the role loop.
    const totalDistributed = totalPaymentsToStaff + totalExternalFees;
    const totalAvailable = cashTotal + ctpTotal + grtTotalAvailable;

    const overallBalance = r2(totalAvailable - totalDistributed);
    if (Math.abs(overallBalance) > 0.05) {
        validations.push(`Balance Warning: Shift does not balance. Total Available: ${r2(totalAvailable)}, Total Distributed: ${r2(totalDistributed)}, Diff: ${overallBalance}`);
    }

    const balances = {
        poolBalances: {
            'Team CTP': r2(totalAdjTeamCTP - clean_TeamCTP),
            'Team CASH': r2(totalAdjTeamCash - out_TeamCASH),
            'Team GRT': r2(totalAdjTeamGRT - clean_TeamGRT),
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
        runnerDeductionsByPool: runnerDeductions,
        adjustedPools: {
            adjustedTeamCTPPool: r2(totalAdjTeamCTP),
            adjustedTeamCashPool: r2(totalAdjTeamCash),
            adjustedTeamGRTPool: r2(totalAdjTeamGRT),
            adjustedBarCTPPool: r2(adjustedBarCTPPool),
            adjustedBarGRTPool: r2(adjustedBarGRTPool)
        },
        pointTotals: {
            totalBarPoints
        },
        pointValues: {
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
