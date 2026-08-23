import assert from "node:assert/strict";
import test from "node:test";

import {
    applyTeamGroupPatch,
    buildBarGroupPatch,
    buildTeamGroupDraft,
    shouldAcceptRemoteGroupUpdate,
} from "./settleGroupPersistence.js";

test("buildTeamGroupDraft is a full-replace payload, defaulting contracts/markedDone", () => {
    assert.deepEqual(
        buildTeamGroupDraft({ pools: { tips: "100" }, now: "2026-08-23T00:00:00.000Z", updatedBy: "uid1" }),
        {
            pools: { tips: "100" },
            contracts: [],
            markedDone: false,
            updatedAt: "2026-08-23T00:00:00.000Z",
            updatedBy: "uid1",
        }
    );
});

test("buildBarGroupPatch only touches barTeam.pools/markedDone/settleUpdated*, never members", () => {
    const patch = buildBarGroupPatch({ pools: { tips: "50" }, markedDone: true, now: "t", updatedBy: "uid2" });
    assert.deepEqual(Object.keys(patch).sort(), [
        "barTeam.markedDone",
        "barTeam.pools",
        "barTeam.settleUpdatedAt",
        "barTeam.settleUpdatedBy",
    ]);
    assert.equal(patch["barTeam.markedDone"], true);
});

test("applyTeamGroupPatch merges by teamId and leaves other teams untouched", () => {
    const teams = [
        { teamId: "team-1", pools: { tips: "1" } },
        { teamId: "team-2", pools: { tips: "2" } },
    ];
    const next = applyTeamGroupPatch(teams, "team-2", { pools: { tips: "99" }, markedDone: true });
    assert.deepEqual(next[0], { teamId: "team-1", pools: { tips: "1" } });
    assert.deepEqual(next[1], { teamId: "team-2", pools: { tips: "99" }, markedDone: true });
});

test("a remote update to the actively-edited group is refused; every other group accepts it", () => {
    assert.equal(shouldAcceptRemoteGroupUpdate("team-1", "team-1"), false);
    assert.equal(shouldAcceptRemoteGroupUpdate("team-2", "team-1"), true);
    assert.equal(shouldAcceptRemoteGroupUpdate("bar", "team-1"), true);
});
