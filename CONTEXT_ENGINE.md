Tip Distribution Engine – Developer Context (README)
Purpose

This document describes the logic used to calculate and distribute tips for a restaurant shift.
It is intended as a reference for developers implementing the tip distribution engine.

The system processes inputs from multiple dining room teams and the bar, calculates required allocations, and distributes the remaining pools among employees using a point-based payout model.

The logic is designed to:
- Separate calculation rules from distribution rules
- Ensure that sales are only used as calculation bases
- Keep the actual payouts tied strictly to tip pools

1. Core Principles
Sales vs Tip Pools

Sales are not money distributed to staff. They are only used to determine percentage-based allocations.
Actual payouts always come from tip pools (CTP, GRT, Cash).

2. Shift Inputs

Each team provides: sales, ctp, grt, cgrt, cash.
The bar provides: sales, ctp, grt, covers, and a **Runners Transfer** amount.

3. Aggregated Totals

All team data is aggregated into shift totals (totalSales, totalCTP, etc.).
The bar Sales/Tips are handled independently until the transfer phase.

4. Contract Sales Calculation

contractSales = totalCGRT / 0.26
(Used to calculate gratuity-based allocations like House and Captain Override).

5. Regular Dining Room Sales

regularSales = totalSales - contractSales
(Used as the base for CTP-based allocations like Bar Fee and Door Fee).

6. Allocation Phase (Deductions)

Allocations are subtracted from the raw pools before any staff distribution.

7. CTP Allocations (From Regular Sales)
- **Bar Fee**: 1% of regular sales (Team CTP → Bar CTP).
- **Door Fee**: 0.5% of regular sales (Removed from Team CTP).
- **Captain Override (CTP)**: 1% of regular sales (Merged into Captain payouts).
- **Runners**: 100% of Runner Pay (Flat rate, default $102) is deducted from the Team CTP pool.

8. Gratuity Allocations (From Contract Sales)
- **House**: 3%
- **Coordinator**: 2%
- **Door**: 2%
- **Bar**: 1%
- **Captain Override (GRT)**: 1%

9. Pool Adjustment Phase (Transfers)

After initial allocations, the engine performs manual pool-to-pool adjustments based on user input:
- **Bar-to-Team Transfer**: The amount in the Bar "Runners Transfer" field is:
    1. Subtracted from the Bar CTP adjusted pool.
    2. Added to the Dining Room Staff CTP adjusted pool.

10. Final Adjusted Pools

- **Adjusted Team CTP**: `(Base Tips - Allocations - 100% Runners) + Bar_Transfer`
- **Adjusted Bar CTP**: `(Bar Tips + Bar_Fee - Bar_Transfer)`

11. Distribution Phase (Point System)

Staff Payouts = `Points * PointValue`

The **Point Value (PV)** is calculated from the final adjusted pools.
For transparency, the Point Value is calculated in two parts in the engine logs:
1. **Base Staff PV**: `(Total DR Tips net of runners) / Total Points`
2. **Transfer PV**: `(Manual Bar Contribution) / Total Points`
3. **Final Staff PV**: `Base Staff PV + Transfer PV`

12. Reconciliation & Integrity

- **Rounding**: Any rounding drift (from dividing tips by points) is reconciled with the last person in the team's array.
- **Balance Check**: `Total Available Tips (Inputs) == Total Distributed (Staff + Fees)`.
- **Target**: The balance must always reconcile to exactly **$0.00**.

13. Summary of Sequence
1. **Aggregate**: Sum all sales and tips.
2. **Allocate**: Deduct House/Door fees and 100% of Runner Pay from DR.
3. **Transfer**: Move manual Bar contribution to the Team pool.
4. **Distribute**: Calculate final point values and individual payouts.
5. **Audit**: Verify shift balances to zero.