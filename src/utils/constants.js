/**
 * constants.js
 * 
 * Centralized source of truth for role points, mappings, and flat rates.
 * Values here are synchronized with the calculation engine requirements.
 */

export const ROLE_POINTS = {
    captain: 4,
    server: 4,
    back: 2.5,
    assistant: 2,
};

export const RUNNER_FLAT_RATE = 85;

// The bar's Runners Fee is 3% of the bar's total food sales. This rate only ever
// PREFILLS the fee at Settle up: the fee AMOUNT is the field, and a manager or
// supervisor who runs a different rate expresses that by editing the amount. So the
// engine never sees this number - it takes the amount as entered (`pools.runners`)
// and moves it from the bar's CTP to the dining pool exactly as before.
export const RUNNERS_FEE_FOOD_SALES_RATE = 0.03;
