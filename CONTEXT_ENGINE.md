Tip Distribution Engine – Developer Context (README)
Purpose

This document describes the logic used to calculate and distribute tips for a restaurant shift.
It is intended as a reference for developers implementing the tip distribution engine.

The system processes inputs from multiple dining room teams and the bar, calculates required allocations, and distributes the remaining pools among employees using a point-based payout model.

The logic is designed to:

Separate calculation rules from distribution rules

Ensure that sales are only used as calculation bases

Keep the actual payouts tied strictly to tip pools

1. Core Principles
Sales vs Tip Pools

Sales are not money distributed to staff.
Sales are only used to determine percentage-based allocations.

Actual payouts always come from tip pools.

Tip pools include:

CTP — Credit card tips

GRT — Regular gratuity

CGRT — Contract gratuity

Cash

Dining Room vs Bar

The system maintains two service areas:

Dining Room (Teams)
All floor staff working in teams.

Bar

The bar receives certain allocations from dining room sales but distributes its own pool independently.

2. Shift Inputs

Each dining room team provides the following inputs:

sales
ctp
grt
cgrt
cash
wineSales
liquorSales
covers

The bar provides:

sales
ctp
grt
wineSales
liquorSales
covers

Note:
The bar does not generate contract gratuity (CGRT).

3. Aggregated Totals

All team data is aggregated into shift totals.

Dining room totals:

totalSales
totalCTP
totalGRT
totalCGRT
totalCash
totalCovers

Bar totals:

barSales
barCTP
barGRT
barCovers
4. Contract Sales Calculation

Contract gratuity is typically 26% of the contract sale value.

To determine contract sales:

contractSales = totalCGRT / 0.26

Example:

totalCGRT = 2600
contractSales = 2600 / 0.26 = 10000
5. Regular Dining Room Sales

Regular sales exclude contract sales.

regularSales = totalSales - contractSales

Regular sales become the base for CTP allocations.

6. Allocation Phase

Two types of allocations exist:

CTP Allocations

Contract Gratuity Allocations

These allocations occur before team distributions.

7. CTP Allocations (From Regular Sales)

These are calculated from regular dining room sales but paid from the CTP pool.

Captain Override
captainAllocation = 1% of regularSales

This amount is split evenly among captains working that shift.

Bar Allocation
barCTPAllocation = 1% of regularSales

This amount moves from team CTP → bar CTP.

Door Allocation
doorCTPAllocation = 0.5% of regularSales

This amount is removed from team CTP.

Runner Pay

Runners are paid a flat rate.

runnerPay = $102 per runner

Runner funding may come from:

teamCTP
barCTP
or both

This is configurable per shift.

8. Contract Gratuity Allocations (From CGRT)

Contract gratuity triggers additional allocations.

These are calculated from contract sales but paid from CGRT.

captainCGRT = 1% of contractSales
barCGRT = 1% of contractSales
doorCGRT = 2% of contractSales
coordinatorCGRT = 2% of contractSales
houseCGRT = 3% of contractSales

Total contract deductions:

contractAllocations =
captainCGRT + barCGRT + doorCGRT + coordinatorCGRT + houseCGRT
9. Remaining Contract Gratuity

After contract allocations are removed:

remainingCGRT = totalCGRT - contractAllocations
10. Gratuity Pool Simplification

To simplify distribution logic:

After allocations are completed:

finalGRT = totalGRT + remainingCGRT

This merges regular gratuity with leftover contract gratuity.

From this point forward the engine treats gratuity as one unified pool.

11. Final Pools Before Distribution

Dining room pools:

finalTeamCTP =
totalCTP
- captainAllocation
- barCTPAllocation
- doorCTPAllocation
- runnerTeamCTPDeductions
finalGRT = totalGRT + remainingCGRT
finalCash = totalCash

Bar pools:

finalBarCTP =
barCTP
+ barCTPAllocation
- runnerBarCTPDeductions
finalBarGRT =
barGRT
+ barCGRT
12. Dining Room Point System

Dining room staff are paid using a point-based distribution system.

Role values:

Captain = 4 points
Server = 4 points
Back Server = 2.5 points
SA / Busser = 2 points
13. Point Value Calculation

Total shift points:

totalPoints = sum(employeePoints)

Pool distributed to team:

teamDistributionPool =
finalTeamCTP
+ finalGRT
+ finalCash

Point value:

pointValue = teamDistributionPool / totalPoints

Employee payout:

employeePay = employeePoints * pointValue
14. Bar Distribution

The bar distributes its pool independently.

Bar pool includes:

finalBarCTP
finalBarGRT

Runner deductions may reduce the bar CTP pool.

The remaining bar pool is divided among bartenders.

15. Calculation Order

The recommended engine sequence:

Aggregate team and bar inputs

Calculate contract sales

Calculate regular dining room sales

Calculate CTP allocations

Calculate contract gratuity allocations

Deduct runner payments

Compute remaining pools

Merge remaining CGRT into finalGRT

Calculate point value

Distribute dining room payouts

Distribute bar payouts

16. Engine Output

The engine should produce:

shiftTotals
salesBreakdown
allocations
remainingPools
finalPools
employeePayouts
barPayouts
runnerDeductions
validationMessages
balanceSummary
17. Validation Rules

The engine should detect and report:

Negative pools

Runner deductions exceeding available pools

Allocation totals exceeding pool values

Imbalanced distributions

The system should ensure:

totalDistributed == totalTipPools
18. Key Simplification Rule

Contract gratuity only exists as a separate entity during the allocation phase.

After allocations:

CGRT → merged into finalGRT

This greatly simplifies the final distribution logic.

Summary

The system operates in three phases:

1. Calculation Phase

Determine sales splits

Compute allocations

2. Pool Normalization

Deduct allocations

Merge gratuity pools

3. Distribution Phase

Calculate point values

Pay employees

This structure keeps the engine deterministic, easier to debug, and easier to maintain.