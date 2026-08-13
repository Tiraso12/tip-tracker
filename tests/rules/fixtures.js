// Shared document builders for the tier rules suites.
//
// tests/rules/firestore.rules.test.js keeps its own copies on purpose - it is
// the pre-tier suite and is left untouched so that it keeps proving today's
// behaviour independently of anything written here.

export const CLOSED_DATE = "2026-05-29";
export const OPEN_DATE = "2026-05-30";

export function validShift(date = OPEN_DATE, overrides = {}) {
    return {
        date,
        status: "closed",
        teams: [],
        barTeam: { members: [], pools: {} },
        runners: [],
        summary: {
            balances: {
                totalAvailable: 0,
                totalDistributed: 0,
                overallBalance: 0,
            },
        },
        firstClosedAt: `${date}T02:00:00.000Z`,
        closedAt: `${date}T02:00:00.000Z`,
        lastRecalculatedAt: `${date}T02:00:00.000Z`,
        updatedAt: `${date}T02:00:00.000Z`,
        updatedBy: "captainUid",
        operationId: "operation-one",
        ...overrides,
    };
}

// A floor plan that pays someone as a captain for the night. `role` here is the
// per-member "worked as" value the money engine reads - pay weight, never a
// permission. See the floor-plan probe in manager-tier.test.js.
export function shiftWithWorkedRole(uid, workedRole, date = OPEN_DATE) {
    return validShift(date, {
        status: "setup",
        teams: [
            {
                id: "team-1",
                name: "Team 1",
                members: [
                    { uid, name: "Server One", role: workedRole, points: 4 },
                ],
            },
        ],
    });
}

export function validPayoutEntry(date = OPEN_DATE, uid = "serverUid", overrides = {}) {
    return {
        ledgerVersion: 1,
        date,
        uid,
        name: "Server One",
        role: "server",
        points: 2,
        tips: 100,
        gratuity: 50,
        cash: 20,
        wineBonus: 0,
        total: 150,
        teamId: "team-1",
        breakdown: {},
        payoutAmount: null,
        operationId: "operation-one",
        updatedAt: `${date}T02:00:00.000Z`,
        updatedBy: "captainUid",
        source: "closeout",
        ...overrides,
    };
}

export function validPayoutMeta(date = OPEN_DATE, overrides = {}) {
    return { date, ledgerVersion: 1, ...overrides };
}

export function validLegacyTip(overrides = {}) {
    return {
        gratuity: 50,
        tip: 100,
        cash: 20,
        wineBonus: 0,
        points: 2,
        total: 150,
        role: "server",
        shiftDate: OPEN_DATE,
        updatedAt: `${OPEN_DATE}T02:00:00.000Z`,
        ...overrides,
    };
}

export function validTempStaff(uid = "tempOne", overrides = {}) {
    return {
        uid,
        name: "Temp One",
        username: "Temp One",
        role: "server",
        status: "active",
        isUnregistered: true,
        createdAt: `${OPEN_DATE}T02:00:00.000Z`,
        ...overrides,
    };
}

export function validAuditEvent(overrides = {}) {
    return {
        type: "shift_closed",
        operationId: "operationOne",
        createdAt: `${OPEN_DATE}T02:00:00.000Z`,
        ledgerVersion: 1,
        date: OPEN_DATE,
        shiftId: OPEN_DATE,
        actorUid: "captainUid",
        previousPayoutUids: [],
        nextPayoutUids: ["serverUid"],
        removedPayoutUids: [],
        previousPayoutCount: 0,
        nextPayoutCount: 1,
        ...overrides,
    };
}

export function userDoc(uid, role, status, username = uid) {
    return { uid, username, email: `${uid}@example.com`, role, status };
}
