import { buildPayoutLedgerEntry } from "./payoutLedger.js";

const MONEY_FIELDS = ["tips", "gratuity", "cash", "wineBonus", "points", "total"];

const toMoney = (value) => Number(value) || 0;

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

export function payoutAmountsMatch(left = {}, right = {}) {
    return MONEY_FIELDS.every((field) => toMoney(left[field]) === toMoney(right[field]));
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
