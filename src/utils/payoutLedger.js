import { collection, doc, getDocs } from "firebase/firestore";

export const PAYOUT_LEDGER_VERSION = 1;
export const PAYOUT_LEDGER_COLLECTION = "payouts";
export const PAYOUT_LEDGER_ENTRIES_COLLECTION = "entries";

export const EMPTY_EMPLOYEE_PAYOUT = {
    gratuity: "",
    tip: "",
    cash: "",
};

const ROLE_GROUPS = {
    captain: "captains",
    server: "servers",
    back: "backs",
    assistant: "assistants",
    bartender: "bar",
    runner: "runners",
};

const emptyRoleGroups = () => ({
    captains: [],
    servers: [],
    backs: [],
    assistants: [],
    bar: [],
    runners: [],
});

const toMoney = (value) => Number(value) || 0;
const r2 = (value) => Math.round((toMoney(value) + Number.EPSILON) * 100) / 100;
const RECONCILIATION_TOLERANCE = 0.05;

// THE TOTAL RULE: `total` is CTP (tips) + GRT (gratuity), for EVERY role.
// Cash is always a separate payment - employees are handed cash on its own and
// must see all three numbers - so it is NEVER folded into a total. Every read
// path below derives the total with this helper rather than trusting a stored
// `total`, so ledger docs written under the old cash-inclusive rule still
// produce correct numbers and reconcile correctly without a data backfill.
export function getPayoutTotal(payout = {}) {
    return r2(toMoney(payout.tips ?? payout.tip) + toMoney(payout.gratuity));
}

export function payoutLedgerMetaRef(db, date) {
    return doc(db, PAYOUT_LEDGER_COLLECTION, date);
}

export function payoutLedgerEntriesCollection(db, date) {
    return collection(db, PAYOUT_LEDGER_COLLECTION, date, PAYOUT_LEDGER_ENTRIES_COLLECTION);
}

export function payoutLedgerEntryRef(db, date, uid) {
    return doc(db, PAYOUT_LEDGER_COLLECTION, date, PAYOUT_LEDGER_ENTRIES_COLLECTION, uid);
}

export function buildPayoutLedgerEntry({
    date,
    uid,
    payout,
    operationId,
    updatedAt,
    updatedBy = null,
    source = "closeout",
}) {
    const tips = toMoney(payout.tips ?? payout.tip);
    const gratuity = toMoney(payout.gratuity);
    const cash = toMoney(payout.cash);
    // Derived, never passed through: an incoming cash-inclusive `total` (old
    // engine output, or a legacy doc being migrated) must not enter the ledger.
    const total = getPayoutTotal({ tips, gratuity });
    const role = payout.role || "staff";

    return {
        ledgerVersion: PAYOUT_LEDGER_VERSION,
        date,
        uid,
        name: payout.name || "Unknown",
        role,
        points: toMoney(payout.points),
        tips,
        gratuity,
        cash,
        wineBonus: toMoney(payout.wineBonus),
        total,
        teamId: payout.teamId || null,
        breakdown: payout.breakdown || {},
        payoutAmount: role === "runner" ? toMoney(payout.payoutAmount ?? total) : null,
        operationId,
        updatedAt,
        updatedBy,
        source,
    };
}

export function ledgerEntryToEmployeeData(entry) {
    if (!entry) return { ...EMPTY_EMPLOYEE_PAYOUT };

    return {
        gratuity: entry.gratuity ?? "",
        tip: entry.tips ?? "",
        cash: entry.cash ?? "",
        wineBonus: entry.wineBonus ?? 0,
        points: entry.points ?? 0,
        total: getPayoutTotal(entry),
        role: entry.role || "",
        shiftDate: entry.date || "",
        updatedAt: entry.updatedAt || "",
    };
}

export function ledgerEntriesToPayoutMap(entries = []) {
    return entries.reduce((acc, entry) => {
        if (!entry?.uid) return acc;
        acc[entry.uid] = {
            name: entry.name || "Unknown",
            role: entry.role || "staff",
            points: toMoney(entry.points),
            tips: toMoney(entry.tips),
            gratuity: toMoney(entry.gratuity),
            cash: toMoney(entry.cash),
            wineBonus: toMoney(entry.wineBonus),
            total: getPayoutTotal(entry),
            teamId: entry.teamId || null,
            breakdown: entry.breakdown || {},
            payoutAmount: entry.payoutAmount ?? null,
        };
        return acc;
    }, {});
}

export function ledgerEntryToSummaryPayout(entry) {
    const tips = toMoney(entry.tips);
    const gratuity = toMoney(entry.gratuity);
    const total = getPayoutTotal(entry);

    return {
        uid: entry.uid,
        name: entry.name || "Unknown",
        role: entry.role || "staff",
        points: toMoney(entry.points),
        ctp: tips,
        grt: gratuity,
        cash: toMoney(entry.cash),
        total,
        teamId: entry.teamId || null,
        breakdown: entry.breakdown || {},
        payoutAmount: entry.role === "runner" ? toMoney(entry.payoutAmount ?? total) : null,
    };
}

export function groupLedgerEntriesForSummary(entries = []) {
    const grouped = emptyRoleGroups();

    entries.forEach((entry) => {
        if (!entry?.uid) return;
        const groupKey = ROLE_GROUPS[entry.role] || "servers";
        grouped[groupKey].push(ledgerEntryToSummaryPayout(entry));
    });

    Object.values(grouped).forEach((group) => {
        group.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    });

    return grouped;
}

export function attachLedgerPayoutsToSummary(summary, entries = []) {
    if (!summary) return null;

    return {
        ...summary,
        payouts: {
            roleGrouped: groupLedgerEntriesForSummary(entries),
        },
        payoutReconciliation: reconcilePayoutLedger({ summary, entries }),
    };
}

// Non-cash money the ledger says staff were paid (CTP + GRT across all roles).
export function getLedgerStaffTotal(entries = []) {
    return r2(entries.reduce((sum, entry) => sum + getPayoutTotal(entry), 0));
}

// Cash the ledger says staff were paid. Tracked as its own side of the books
// rather than being absorbed into the staff total.
export function getLedgerStaffCash(entries = []) {
    return r2(entries.reduce((sum, entry) => sum + toMoney(entry.cash), 0));
}

// The cash the shift intended to hand out: after rounding reconciliation the
// dining cash payouts sum exactly to the adjusted team cash pool. Older summaries
// that predate `adjustedPools` fall back to the base team cash input; if neither
// is present the caller has nothing to check cash against and gets null.
export function getExpectedStaffCash(summary = {}) {
    const pool = summary?.adjustedPools?.adjustedTeamCashPool;
    if (pool !== undefined) return r2(pool);

    const baseTeamCash = summary?.derivedValues?.baseTeamCash;
    if (baseTeamCash !== undefined) return r2(baseTeamCash);

    return null;
}

export function getExternalFeeTotal(summary = {}) {
    const allocations = summary.allocations || {};

    return r2(
        toMoney(allocations.doorCTPAllocation) +
        toMoney(allocations.doorGRTAllocation) +
        toMoney(allocations.peCoordinatorGRT) +
        toMoney(allocations.houseAllocation)
    );
}

export function reconcilePayoutLedger({ summary, entries = [], tolerance = RECONCILIATION_TOLERANCE } = {}) {
    const balances = summary?.balances || {};
    const totalAvailable = r2(balances.totalAvailable);
    const totalDistributed = r2(balances.totalDistributed);
    const hasBalanceFields = balances.totalAvailable !== undefined && balances.totalDistributed !== undefined;
    const overallBalance = r2(balances.overallBalance !== undefined
        ? balances.overallBalance
        : totalAvailable - totalDistributed);
    const externalFees = getExternalFeeTotal(summary);

    // `totalDistributed` is everything the shift handed out, cash included, so
    // stripping the external fees leaves all staff money - cash and non-cash.
    // Ledger totals are now CTP + GRT only, so cash has to be split off here
    // explicitly instead of riding along inside each entry's `total`.
    const expectedStaffPayout = r2(totalDistributed - externalFees);
    const ledgerStaffCash = getLedgerStaffCash(entries);
    const summaryStaffCash = getExpectedStaffCash(summary);
    // With no cash figure in the summary there is nothing independent to check
    // cash against, so fall back to the ledger's own cash. The combined
    // (cash + non-cash) invariant below is still enforced either way.
    const expectedStaffCash = summaryStaffCash === null ? ledgerStaffCash : summaryStaffCash;
    const expectedStaffTotal = r2(expectedStaffPayout - expectedStaffCash);
    const ledgerStaffTotal = getLedgerStaffTotal(entries);
    const ledgerStaffBalance = r2(expectedStaffTotal - ledgerStaffTotal);
    const ledgerCashBalance = r2(expectedStaffCash - ledgerStaffCash);
    const messages = [];

    if (!hasBalanceFields) {
        messages.push("Shift summary is missing totalAvailable or totalDistributed.");
    }

    if (Math.abs(overallBalance) > tolerance) {
        messages.push(`Available money does not reconcile with distributed money. Difference: ${overallBalance.toFixed(2)}.`);
    }

    if (Math.abs(ledgerStaffBalance) > tolerance) {
        messages.push(`Payout ledger does not reconcile with expected staff payouts. Difference: ${ledgerStaffBalance.toFixed(2)}.`);
    }

    if (Math.abs(ledgerCashBalance) > tolerance) {
        messages.push(`Payout ledger cash does not reconcile with the shift's cash pool. Difference: ${ledgerCashBalance.toFixed(2)}.`);
    }

    return {
        ok: messages.length === 0,
        tolerance,
        totalAvailable,
        totalDistributed,
        overallBalance,
        externalFees,
        expectedStaffPayout,
        expectedStaffCash,
        expectedStaffTotal,
        ledgerStaffTotal,
        ledgerStaffCash,
        ledgerStaffBalance,
        ledgerCashBalance,
        messages,
    };
}

export async function fetchPayoutEntriesForDate(db, date) {
    const snap = await getDocs(payoutLedgerEntriesCollection(db, date));
    return snap.docs.map((entryDoc) => ({
        uid: entryDoc.id,
        ...entryDoc.data(),
    }));
}

export async function fetchPayoutEntriesForDates(db, dateKeys = []) {
    const result = {};

    await Promise.all(dateKeys.map(async (date) => {
        result[date] = await fetchPayoutEntriesForDate(db, date);
    }));

    return result;
}
