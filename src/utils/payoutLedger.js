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
    const total = toMoney(payout.total !== undefined ? payout.total : tips + gratuity);
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
        total: entry.total ?? 0,
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
            total: toMoney(entry.total),
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
    const total = toMoney(entry.total !== undefined ? entry.total : tips + gratuity);

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

export function getLedgerStaffTotal(entries = []) {
    return r2(entries.reduce((sum, entry) => (
        sum + (entry.total === undefined
            ? toMoney(entry.tips) + toMoney(entry.gratuity) + toMoney(entry.cash)
            : toMoney(entry.total))
    ), 0));
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
    const expectedStaffTotal = r2(totalDistributed - externalFees);
    const ledgerStaffTotal = getLedgerStaffTotal(entries);
    const ledgerStaffBalance = r2(expectedStaffTotal - ledgerStaffTotal);
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

    return {
        ok: messages.length === 0,
        tolerance,
        totalAvailable,
        totalDistributed,
        overallBalance,
        externalFees,
        expectedStaffTotal,
        ledgerStaffTotal,
        ledgerStaffBalance,
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
