import assert from "node:assert/strict";
import test from "node:test";

import {
    getHistoryFlagUpdate,
    getMergeHistoryState,
    getShiftParticipantUids,
} from "./userHistoryFlags.js";

test("uses existing user history flags before falling back to scans", () => {
    assert.deepEqual(
        getMergeHistoryState({ hasTipHistory: true, hasShiftHistory: false }),
        { hasHistory: true, needsFallbackScan: false }
    );
    assert.deepEqual(
        getMergeHistoryState({ hasTipHistory: false, hasShiftHistory: false }),
        { hasHistory: false, needsFallbackScan: false }
    );
    assert.deepEqual(
        getMergeHistoryState({ username: "Legacy User" }),
        { hasHistory: false, needsFallbackScan: true }
    );
});

test("collects shift participant uids from setup and payout data", () => {
    const uids = getShiftParticipantUids({
        teams: [
            { members: [{ uid: "captainUid" }, { uid: "serverUid" }] },
            { members: [{ uid: "serverUid" }, { uid: "" }] },
        ],
        barTeam: { members: [{ uid: "barUid" }] },
        runners: [{ uid: "runnerUid" }],
        payouts: {
            serverUid: { total: 120 },
            backUid: { total: 80 },
        },
    });

    assert.deepEqual(uids, ["captainUid", "serverUid", "barUid", "runnerUid", "backUid"]);
});

test("builds explicit history flag updates for setup and closed shifts", () => {
    assert.deepEqual(getHistoryFlagUpdate("setup"), { hasShiftHistory: true });
    assert.deepEqual(getHistoryFlagUpdate("closed"), {
        hasShiftHistory: true,
        hasTipHistory: true,
    });
});
