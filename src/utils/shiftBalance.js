// Why a shift will not save, said the way the captain says it.
//
// Exactly one rule blocks a save: the shift has to balance to within five cents.
// `saveClosedShiftAtomically` re-runs `reconcilePayoutLedger` and throws before it
// builds the batch, so an out-of-balance shift never reaches Firestore at all. The
// engine's own wording for that - "Available money does not reconcile with
// distributed money" - names an internal invariant, not a thing a captain can act
// on, so nothing here repeats it.
//
// The engine already knows WHICH money is left over: `balances.poolBalances` is a
// per-pool residual (what the pool held minus what it paid out) and its entries sum
// EXACTLY to `overallBalance`. Verified against the shapes that matter - money in the
// Bar Team with nobody in it, cash entered with nobody on a dining team, and a fully
// balanced contract night. So this file translates that map and never re-derives a
// figure of its own.

const r2 = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
const money = (value) => `$${Math.abs(r2(value)).toFixed(2)}`;

// Matches `reconcilePayoutLedger`. The two must agree or Review would offer a save
// the write path refuses, which is the exact dead end this reporting exists to end.
export const BALANCE_TOLERANCE = 0.05;

const nobodyOnDining = ({ hasDiningStaff }) => (
    hasDiningStaff ? null : "Nobody is on a dining team, so there is nobody to split it."
);

const nobodyOnBar = ({ hasBarStaff }) => (
    hasBarStaff ? null : "Nobody is in the Bar Team, so there is nobody to split it."
);

// Engine pool key -> what the captain calls that money. `hint` is optional and is
// only consulted for a pool that actually has money left in it, so a hint never
// appears against a pool that balanced. A pool with no hint still gets named and
// counted - an unexplained leftover is worth more on screen than nothing at all.
//
// The two captain-override pools carry no hint on purpose. The engine now skips the
// 1% carve-out entirely when nobody works as Captain (engine.js §2, `hasCaptainOnFloor`),
// so the only condition that used to strand money there cannot arise; anything landing
// in them again would be new behaviour, and guessing at its cause would misdirect. They
// stay listed so such money is still named rather than silently unaccounted for.
const LEFTOVER_POOLS = [
    { key: "Dining Room CTP", label: "Dining room CTP", hint: nobodyOnDining },
    { key: "Team GRT", label: "Dining room GRT", hint: nobodyOnDining },
    { key: "Team CASH", label: "Dining room cash", hint: nobodyOnDining },
    { key: "Bar CTP", label: "Bar CTP", hint: nobodyOnBar },
    { key: "Bar GRT", label: "Bar GRT", hint: nobodyOnBar },
    { key: "Cap Ov CTP", label: "Captain override CTP" },
    { key: "Cap Ov GRT", label: "Captain override GRT" },
];

export function describeShiftBalance({ result, teams = [], barTeam = {} } = {}) {
    const balances = result?.balances || {};
    const overallBalance = r2(balances.overallBalance);
    const balanced = Math.abs(overallBalance) <= BALANCE_TOLERANCE;

    if (balanced) {
        return { balanced: true, overallBalance, amount: 0, headline: "", body: "", leftovers: [] };
    }

    const floor = {
        hasDiningStaff: teams.some(team => (team.members || []).length > 0),
        hasBarStaff: (barTeam.members || []).length > 0,
    };

    const poolBalances = balances.poolBalances || {};
    const leftovers = LEFTOVER_POOLS
        .map(pool => ({ ...pool, amount: r2(poolBalances[pool.key]) }))
        .filter(pool => Math.abs(pool.amount) > 0.005)
        .map(pool => ({
            key: pool.key,
            label: pool.label,
            amount: pool.amount,
            hint: pool.hint ? pool.hint(floor) : null,
        }));

    // Positive: more money was entered than the shift hands out, so some of it lands
    // nowhere. Negative: the payouts and fees together come to more than there is.
    const stranded = overallBalance > 0;

    return {
        balanced: false,
        overallBalance,
        amount: Math.abs(overallBalance),
        headline: stranded
            ? `${money(overallBalance)} of this shift's money is not reaching anyone.`
            : `This shift pays out ${money(overallBalance)} more than was entered at Settle up.`,
        body: stranded
            ? "Every dollar entered at Settle up has to end up somewhere - with staff, the house or the door - before the shift can be saved."
            : "The payouts, the house and the door together come to more than the money entered at Settle up, so the shift cannot be saved.",
        leftovers,
    };
}
