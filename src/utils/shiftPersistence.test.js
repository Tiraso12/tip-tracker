import assert from "node:assert/strict";
import test from "node:test";

import { buildClosedShiftPayload, buildShiftSetupDraft, getRemovedPayoutUids } from "./shiftPersistence.js";

test("builds a setup draft without payout data", () => {
    const teams = [
        {
            teamId: "team-1",
            members: [{ uid: "u1", name: "Alex", role: "server", points: 1.5 }],
            pools: { sales: "", tips: "", gratuity: "", cash: "" },
        },
    ];
    const barTeam = {
        members: [{ uid: "u2", name: "Sam", role: "bartender", points: 1 }],
        pools: { sales: "", tips: "", gratuity: "" },
    };
    const runners = [{ uid: "u3", name: "Jordan", role: "runner", payoutAmount: 102 }];

    const draft = buildShiftSetupDraft({
        date: "2026-05-22",
        teams,
        barTeam,
        runners,
        now: "2026-05-22T18:00:00.000Z",
    });

    assert.equal(draft.status, "setup");
    assert.equal(draft.date, "2026-05-22");
    assert.deepEqual(draft.teams, teams);
    assert.deepEqual(draft.barTeam, barTeam);
    assert.deepEqual(draft.runners, runners);
    assert.equal(draft.setupSavedAt, "2026-05-22T18:00:00.000Z");
    assert.equal(draft.updatedAt, "2026-05-22T18:00:00.000Z");
    assert.equal("payouts" in draft, false);
    assert.equal("summary" in draft, false);
});

test("marks setup drafts that include autosaved closeout inputs", () => {
    const draft = buildShiftSetupDraft({
        date: "2026-05-22",
        teams: [{ teamId: "team-1", members: [], pools: { sales: "1000", tips: "200" } }],
        barTeam: { members: [], pools: {} },
        runners: [],
        now: "2026-05-22T18:30:00.000Z",
        includeCloseoutDraft: true,
    });

    assert.equal(draft.status, "setup");
    assert.equal(draft.closeoutDraftSavedAt, "2026-05-22T18:30:00.000Z");
    assert.equal("payouts" in draft, false);
    assert.equal("summary" in draft, false);
});

test("builds a closed shift payload with payout data", () => {
    const teams = [{ teamId: "team-1", members: [], pools: {} }];
    const barTeam = { members: [], pools: {} };
    const runners = [];
    const payouts = { u1: { total: 125 } };
    const summary = { balances: { overallBalance: 0 } };

    const payload = buildClosedShiftPayload({
        date: "2026-05-22",
        teams,
        barTeam,
        runners,
        payouts,
        summary,
        now: "2026-05-23T02:00:00.000Z",
    });

    assert.equal(payload.status, "closed");
    assert.deepEqual(payload.teams, teams);
    assert.deepEqual(payload.barTeam, barTeam);
    assert.deepEqual(payload.runners, runners);
    assert.deepEqual(payload.payouts, payouts);
    assert.deepEqual(payload.summary, summary);
    assert.equal(payload.closedAt, "2026-05-23T02:00:00.000Z");
    assert.equal(payload.updatedAt, "2026-05-23T02:00:00.000Z");
});

test("finds employees removed from a recalculated shift payout", () => {
    const previousPayouts = {
        dina: { total: 120 },
        alex: { total: 95 },
        sam: { total: 80 },
    };
    const nextPayouts = {
        alex: { total: 110 },
        sam: { total: 85 },
    };

    assert.deepEqual(getRemovedPayoutUids(previousPayouts, nextPayouts), ["dina"]);
});
