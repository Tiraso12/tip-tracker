/**
 * engine.js
 * 
 * Pure calculation engine for Tip-Out app payouts.
 * 
 * This module has no UI dependencies. It takes flattened shift inputs 
 * and returns calculated point values, allocations, and individual payouts, 
 * along with a double-entry balance check.
 */

import { ROLE_POINTS, RUNNER_FLAT_RATE } from './constants.js';




const n = (val) => Number(val) || 0;
const r2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const sumProp = (arr, prop) => arr.reduce((sum, item) => sum + n(item[prop]), 0);

/**
 * Reconciles rounding errors by adjusting the last item in an array 
 * so the sum of a specific key exactly matches the target total.
 */
function reconcile(arr, targetTotal, key) {
    if (!arr || arr.length === 0) return;
    const currentSum = sumProp(arr, key);
    const diff = r2(targetTotal - currentSum);
    if (diff !== 0) {
        const lastItem = arr[arr.length - 1];
        lastItem[key] = r2(lastItem[key] + diff);
        if (lastItem.total !== undefined) {
            // Recalculate total if the item has one. `total` is CTP + GRT only -
            // cash is always paid and reported separately, never folded into a total.
            lastItem.total = r2(lastItem.ctp + (lastItem.grt || 0));
        }
    }
}

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


    const validations = [];

    // 1. DERIVED VALUES

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
    const barToTeamTransfer = Math.max(0, n(config.barTeam.pools?.runners));
    const hasBarTeam = config.barTeam.members.length > 0;
    // The same question on the dining side, asked here so section 2 can skip the
    // captain override when nobody works the role. `role` is the job worked that
    // night, matched exactly the way section 9 builds activeCaptains - the two must
    // agree, or money is carved out for a captain the payout loop never finds.
    const hasCaptainOnFloor = config.teams.some((t) =>
        (t.members || []).some((m) => m.role === 'captain')
    );

    // If new format is active, firmly ignore global inputs to prevent ghost totals
    const baseTeamCTP = totalTeamCTP;
    const ctpTotal = baseTeamCTP + barCTP;

    const baseTeamCash = totalTeamCash;
    const cashTotal = baseTeamCash;

    const grtContractTotal = teamContractGratTotal;

    // Total Gratuity Available (Regular + Contract)
    const grtTotalAvailable = totalTeamGrt + barGRT + grtContractTotal;

    const contractSales = grtContractTotal / 0.26 || 0;

    let regularSalesBase = totalTeamSales - contractSales;
    if (contractSales > totalTeamSales) {
        regularSalesBase = 0;
        validations.push("Warning: Contract sales exceed total team sales. Regular sales base clamped to 0.");
    }

    // 5. RUNNER LOGIC (SIMPLIFIED)
    // Runners are calculated here because they are deducted from the raw pool alongside allocations
    const runnerPayouts = config.runners.map(runner => {
        const payoutAmount = n(runner.payoutAmount) || RUNNER_FLAT_RATE;
        if (payoutAmount < 0) validations.push(`Warning: Runner ${runner.name || 'Unknown'} has a negative payout amount.`);

        return {
            uid: runner.uid,
            name: runner.name,
            role: 'runner',
            payoutAmount: r2(payoutAmount),
            breakdown: { "Manual Split": r2(payoutAmount) }
        };
    });

    const totalRunnerPay = r2(sumProp(runnerPayouts, 'payoutAmount'));

    // 2. PRE-DISTRIBUTIONS
    // Two bases, never one: everything on the CTP side is a rate on regularSalesBase
    // (bar 1%, door 0.5%, captain override 1%), and everything on the GRT side is a
    // rate on contractSales (bar 1%, door 2%, PE coordinator 2%, house 3%, captain
    // override 1%). The same name carries a different rate on each side - "door" is
    // 0.5% here and 2% below - so quoting one rate per allocation is always wrong.
    //
    // Two allocations are conditional on who is actually on the floor, for the same
    // reason: money carved out for a role nobody works is paid to nobody, and the
    // shift then cannot be settled at all (section 11's balance check is enforced as
    // a hard throw by reconcilePayoutLedger on save).
    //
    // Bar allocations only apply when a bar team with members is active. When bartenders
    // work a contract shift as captains in a regular team they are not in barTeam, so
    // hasBarTeam = false and these allocations are skipped to avoid stranded pool money.
    //
    // The captain override is skipped the same way when no one works as Captain. The
    // 1% then simply stays in the dining pools the team splits - staff keep it, it does
    // not go to the house. That is the captain's ruling, made 2026-08-14; a one-server
    // night was unclosable before it.
    const barCTPAllocation = hasBarTeam ? r2(regularSalesBase * 0.01) : 0;
    const doorCTPAllocation = r2(regularSalesBase * 0.005);
    const captainOverrideCTP = hasCaptainOnFloor ? r2(regularSalesBase * 0.01) : 0;
    const captainOverrideGRT = hasCaptainOnFloor ? r2(contractSales * 0.01) : 0;
    const barGRTAllocation = hasBarTeam ? r2(contractSales * 0.01) : 0;
    const doorGRTAllocation = r2(contractSales * 0.02);
    const peCoordinatorGRT = r2(contractSales * 0.02);
    const houseAllocation = r2(contractSales * 0.03);

    const runnerDeductions = {
        'Dining Room CTP': totalRunnerPay
    };

    // 4. TEAM POOLS
    const rawTeamCTPPool = baseTeamCTP - barCTPAllocation - doorCTPAllocation - captainOverrideCTP - totalRunnerPay;
    const rawTeamCashPool = baseTeamCash;
    const rawTeamGRTPool = (totalTeamGrt + grtContractTotal) - barGRTAllocation - doorGRTAllocation - peCoordinatorGRT - houseAllocation - captainOverrideGRT;

    const rawBarCTPPool = barCTP + barCTPAllocation;
    const rawBarGRTPool = barGRT + barGRTAllocation;

    // 6. ADJUSTED POOLS
    const adjustedTeamCTPPool = r2(rawTeamCTPPool + barToTeamTransfer);
    const adjustedBarCTPPool = r2(rawBarCTPPool - barToTeamTransfer);
    const adjustedBarGRTPool = rawBarGRTPool;
    const adjustedTeamCashPool = rawTeamCashPool;
    const adjustedTeamGRTPool = rawTeamGRTPool;

    if (adjustedBarCTPPool < 0) validations.push(`Warning: Bar CTP pool is negative.`);
    if (adjustedTeamCTPPool < 0) validations.push(`Warning: Dining Room CTP pool is negative.`);

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
        // Sum the ROUNDED components, not the raw ones: the employee sees the
        // rounded CTP and GRT, so the total has to be exactly what those two add
        // to. Summing raw values first can land a cent above the visible sum.
        const ctp = r2(pts * barCTPPointValue);
        const grt = r2(pts * barGRTPointValue);
        return {
            uid: emp.uid,
            name: emp.name,
            role: 'bartender',
            points: pts,
            ctp,
            grt,
            cash: 0,
            total: r2(ctp + grt)
        };
    });

    reconcile(barPayouts, adjustedBarCTPPool, 'ctp');
    reconcile(barPayouts, adjustedBarGRTPool, 'grt');

    // 8. POINT DISTRIBUTION (TEAM) 
    // Teams are grouped. We first need total points across ALL teams to find point values.
    const allProcessedTeamMembers = [];
    const activeCaptains = [];

    const teamsProcessed = config.teams.map((team, idx) => {
        const teamDisplayName = `Team ${idx + 1}`;
        const loc_teamSalesBase = Math.max(0, n(team.pools?.sales) || n(team.teamSales));

        const loc_adjCTP = totalTeamSales > 0 ? (loc_teamSalesBase / totalTeamSales) * adjustedTeamCTPPool : 0;
        const loc_adjCash = totalTeamSales > 0 ? (loc_teamSalesBase / totalTeamSales) * adjustedTeamCashPool : 0;
        const loc_adjGRT = totalTeamSales > 0 ? (loc_teamSalesBase / totalTeamSales) * adjustedTeamGRTPool : 0;

        const processedMembers = (team.members || []).map(emp => {
            const pts = (emp.points !== undefined && emp.points !== null && emp.points !== "")
                ? n(emp.points)
                : (ROLE_POINTS[emp.role] || 0);

            const m = { ...emp, points: pts, _stdRole: emp.role, teamId: teamDisplayName };
            allProcessedTeamMembers.push(m);

            if (emp.role === 'captain') {
                activeCaptains.push(m);
            }
            return m;
        });

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
    // The split below is only ever reached with a captain on the floor, because
    // section 2 carves nothing out without one (hasCaptainOnFloor). Both sides of
    // the pair therefore stay 0 on a no-captain night: nothing deducted, nothing to
    // hand out, "Cap Ov CTP"/"Cap Ov GRT" balance at 0 and the shift settles.
    //
    // This used to be carved out unconditionally and the resulting stranded money was
    // defended as the shift telling the truth. That held while it was only a warning;
    // it stopped holding when reconcilePayoutLedger began throwing on the same
    // condition, which made a night with no captain impossible to close.
    //
    // The captainCount guard below is kept even so - it is the divide-by-zero guard,
    // and it keeps this block correct on its own terms rather than only by what
    // section 2 happens to do.
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
    // Dining-room CTP/GRT/cash are pooled house-wide: one point value is computed across
    // ALL dining teams combined and applied to every dining employee, regardless of which
    // team's money they came from. This is intentional restaurant policy (tips pool across
    // teams and split by points), not a per-team split - do not "fix" this into computing
    // separate point values per team. The UI still collects money per team for entry
    // convenience/auditing (see loc_adjCTP/loc_adjCash/loc_adjGRT above), but those per-team
    // proportional amounts are not what drives payouts here.
    const totalAllTeamPoints = teamsProcessed.reduce((sum, t) => sum + t.teamPts, 0);

    const globalTeamCTPPointValue = totalAllTeamPoints > 0 ? adjustedTeamCTPPool / totalAllTeamPoints : 0;
    const globalTeamCashPointValue = totalAllTeamPoints > 0 ? adjustedTeamCashPool / totalAllTeamPoints : 0;
    const globalTeamGRTPointValue = totalAllTeamPoints > 0 ? adjustedTeamGRTPool / totalAllTeamPoints : 0;

    const teamPayouts = [];
    const roleGroupedPayouts = {
        captains: [],
        servers: [],
        backs: [],
        assistants: [],
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

            const roundedCTP = r2(ctp);
            const roundedGRT = r2(grt);

            const payoutObj = {
                uid: emp.uid,
                name: emp.name,
                role: emp._stdRole,
                points: emp.points,
                ctp: roundedCTP,
                cash: r2(cash),
                grt: roundedGRT,
                // CTP + GRT only, matching bar payouts above. Cash is a separate
                // payment to the employee and is never rolled into `total`.
                total: r2(roundedCTP + roundedGRT),
                teamId: team.teamId
            };

            // Push to correct role group
            if (emp._stdRole === 'captain') roleGroupedPayouts.captains.push(payoutObj);
            else if (emp._stdRole === 'server') roleGroupedPayouts.servers.push(payoutObj);
            else if (emp._stdRole === 'back') roleGroupedPayouts.backs.push(payoutObj);
            else if (emp._stdRole === 'assistant') roleGroupedPayouts.assistants.push(payoutObj);

            return payoutObj;
        });

        teamPayouts.push({
            teamId: team.teamId,
            payouts: teamMembersPayout
        });
    });

    // Flatten all team payouts for reconciliation
    const allPayoutsFlat = teamPayouts.reduce((acc, t) => acc.concat(t.payouts), []);
    const targetDRCTP = r2(adjustedTeamCTPPool + (activeCaptains.length * splitCTP));

    reconcile(allPayoutsFlat, targetDRCTP, 'ctp');
    reconcile(allPayoutsFlat, r2(adjustedTeamGRTPool + (activeCaptains.length * splitGRT)), 'grt');
    reconcile(allPayoutsFlat, adjustedTeamCashPool, 'cash');

    // Reconcile Runners
    reconcile(runnerPayouts, totalRunnerPay, 'payoutAmount');

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

    const out_Allocations = doorCTPAllocation + doorGRTAllocation + peCoordinatorGRT + houseAllocation;

    // The global balance check should simply be:
    // Total Available (Input) - Total Distributed (Everyone's Payouts + External Fees)
    const totalPaymentsToStaff = out_TeamCASH + out_TeamCTP + out_TeamGRT + out_BarCTP + out_BarGRT + totalRunnerPay;
    const totalExternalFees = out_Allocations;

    // Note: Captain Overrides are ALREADY included inside out_TeamCTP/GRT since we merged them in the role loop.
    const totalDistributed = totalPaymentsToStaff + totalExternalFees;
    const totalAvailable = cashTotal + ctpTotal + grtTotalAvailable;

    const overallBalance = r2(totalAvailable - totalDistributed);

    if (Math.abs(overallBalance) > 0.05) {
        validations.push(`Balance Warning: Shift does not balance. Total Available: ${r2(totalAvailable)}, Total Distributed: ${r2(totalDistributed)}, Diff: ${overallBalance}`);
    }

    const balances = {
        poolBalances: {
            'Dining Room CTP': r2(adjustedTeamCTPPool - clean_TeamCTP),
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
            barSales: r2(barSales),
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
            houseAllocation: r2(houseAllocation),
            totalRunnerPay: r2(totalRunnerPay)
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
            adjustedTeamCTPPool: r2(adjustedTeamCTPPool),
            adjustedTeamCashPool: r2(adjustedTeamCashPool),
            adjustedTeamGRTPool: r2(adjustedTeamGRTPool),
            adjustedBarCTPPool: r2(adjustedBarCTPPool),
            adjustedBarGRTPool: r2(adjustedBarGRTPool)
        },
        pointTotals: {
            totalBarPoints,
            totalAllTeamPoints: r2(totalAllTeamPoints)
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
