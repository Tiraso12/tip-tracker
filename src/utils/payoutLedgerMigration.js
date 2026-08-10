import { buildPayoutLedgerEntry } from "./payoutLedger.js";

// Genuine money actually paid to staff. `points` is intentionally excluded: it
// is a distribution WEIGHT (e.g. 2, 2.5, 4), not paid money - the
// users/{uid}/tips mirror stores points: 0 while the shift payout carries the
// real weight, so treating it as a money field flags zero-dollar differences as
// conflicts. `total` is likewise excluded here because it is DERIVED (see below).
const MONEY_FIELDS = ["tips", "gratuity", "cash", "wineBonus"];

// `total` is derived from the money fields and stored rounded in one source
// (shift) but raw (tips + gratuity) in the other, so the two can legitimately
// differ by a rounding cent. Compare it only within a 1-cent tolerance.
const DERIVED_FIELDS = ["total"];

// Tolerances expressed in whole cents. Money fields must agree to the cent
// (float noise is snapped away by rounding); the derived total may differ by one
// cent because one source rounds it and the other stores the raw sum.
const MONEY_TOLERANCE_CENTS = 0;
const DERIVED_TOLERANCE_CENTS = 1;

const toMoney = (value) => Number(value) || 0;

// Compare in integer cents so we never subtract two floats directly - e.g. a
// legitimate 1-cent gap like 531.44 - 531.43 evaluates to 0.01000000000000477
// in floating point, which would spuriously exceed a 0.01 epsilon.
const toCents = (value) => Math.round(toMoney(value) * 100);
const moneyWithin = (left, right, toleranceCents) =>
    Math.abs(toCents(left) - toCents(right)) <= toleranceCents;

function entryKey(date, uid) {
    return `${date}/${uid}`;
}

function normalizeLegacyShiftPayout(date, uid, payout = {}) {
    return {
        date,
        uid,
        name: payout.name || "Unknown",
        role: payout.role || "staff",
        points: toMoney(payout.points),
        tips: toMoney(payout.tips ?? payout.tip),
        gratuity: toMoney(payout.gratuity),
        cash: toMoney(payout.cash),
        wineBonus: toMoney(payout.wineBonus),
        total: toMoney(payout.total),
        teamId: payout.teamId || null,
        breakdown: payout.breakdown || {},
        payoutAmount: payout.payoutAmount ?? null,
    };
}

function normalizeLegacyTipPayout(date, uid, tip = {}) {
    const tips = toMoney(tip.tips ?? tip.tip);
    const gratuity = toMoney(tip.gratuity);

    return {
        date,
        uid,
        name: tip.name || "Unknown",
        role: tip.role || "staff",
        points: toMoney(tip.points),
        tips,
        gratuity,
        cash: toMoney(tip.cash),
        wineBonus: toMoney(tip.wineBonus),
        total: toMoney(tip.total !== undefined ? tip.total : tips + gratuity),
        teamId: tip.teamId || null,
        breakdown: tip.breakdown || {},
        payoutAmount: tip.payoutAmount ?? null,
    };
}

// Two legacy payouts represent "the same money paid" when the genuine money
// fields agree (within float noise) and the derived total agrees within a cent.
// Weight (`points`) is ignored entirely.
export function payoutAmountsMatch(left = {}, right = {}) {
    return (
        MONEY_FIELDS.every((field) => moneyWithin(left[field], right[field], MONEY_TOLERANCE_CENTS)) &&
        DERIVED_FIELDS.every((field) => moneyWithin(left[field], right[field], DERIVED_TOLERANCE_CENTS))
    );
}

export function buildCanonicalPayoutLedgerMigration({ shifts = [], tips = [] } = {}) {
    const entriesByKey = new Map();
    const conflicts = [];
    let shiftPayoutCount = 0;
    let tipPayoutCount = 0;

    const addEntry = ({ entry, source }) => {
        const key = entryKey(entry.date, entry.uid);
        const existing = entriesByKey.get(key);

        if (!existing) {
            entriesByKey.set(key, { entry, sources: [source] });
            return;
        }

        if (!payoutAmountsMatch(existing.entry, entry)) {
            conflicts.push({
                date: entry.date,
                uid: entry.uid,
                sources: [...existing.sources, source],
                existing: existing.entry,
                incoming: entry,
            });
            return;
        }

        entriesByKey.set(key, {
            entry: {
                ...entry,
                name: existing.entry.name !== "Unknown" ? existing.entry.name : entry.name,
                role: existing.entry.role !== "staff" ? existing.entry.role : entry.role,
                teamId: existing.entry.teamId || entry.teamId || null,
                breakdown: Object.keys(existing.entry.breakdown || {}).length > 0
                    ? existing.entry.breakdown
                    : entry.breakdown,
                payoutAmount: existing.entry.payoutAmount ?? entry.payoutAmount ?? null,
            },
            sources: [...new Set([...existing.sources, source])],
        });
    };

    shifts.forEach(({ id, data }) => {
        const date = data?.date || id;
        Object.entries(data?.payouts || {}).forEach(([uid, payout]) => {
            shiftPayoutCount += 1;
            addEntry({
                source: "shift",
                entry: normalizeLegacyShiftPayout(date, uid, payout),
            });
        });
    });

    tips.forEach(({ uid, date, data }) => {
        tipPayoutCount += 1;
        addEntry({
            source: "tip",
            entry: normalizeLegacyTipPayout(date, uid, data),
        });
    });

    const entries = Array.from(entriesByKey.values())
        .map(({ entry, sources }) => ({ ...entry, sources }))
        .sort((a, b) => entryKey(a.date, a.uid).localeCompare(entryKey(b.date, b.uid)));

    return {
        entries,
        conflicts,
        counts: {
            shiftPayouts: shiftPayoutCount,
            tipPayouts: tipPayoutCount,
            canonicalEntries: entries.length,
            conflicts: conflicts.length,
        },
    };
}

export function planPayoutLedgerWrites({
    desiredEntries = [],
    existingEntries = [],
    operationId,
    updatedAt,
    updatedBy = "migration",
} = {}) {
    const existingByKey = new Map(existingEntries.map((entry) => [entryKey(entry.date, entry.uid), entry]));
    const conflicts = [];
    const writes = [];
    const skipped = [];

    desiredEntries.forEach((entry) => {
        const existing = existingByKey.get(entryKey(entry.date, entry.uid));
        if (existing) {
            if (!payoutAmountsMatch(existing, entry)) {
                conflicts.push({
                    date: entry.date,
                    uid: entry.uid,
                    existing,
                    desired: entry,
                });
                return;
            }
            skipped.push(entry);
            return;
        }

        writes.push({
            date: entry.date,
            uid: entry.uid,
            data: buildPayoutLedgerEntry({
                date: entry.date,
                uid: entry.uid,
                payout: entry,
                operationId,
                updatedAt,
                updatedBy,
                source: "migration",
            }),
        });
    });

    return {
        writes,
        skipped,
        conflicts,
        counts: {
            writes: writes.length,
            skipped: skipped.length,
            conflicts: conflicts.length,
        },
    };
}
