import assert from "node:assert/strict";
import test from "node:test";

import { getTeamSummary } from "./shiftEditorUtils.js";

test("team display pool excludes cash while keeping cash separate", () => {
    const summary = getTeamSummary({
        pools: {
            tips: "200",
            gratuity: "100",
            cash: "50",
            sales: "1000",
            covers: "12",
        },
        contracts: [{ gratuity: "26" }],
    });

    assert.equal(summary.payoutPool, 326);
    assert.equal(summary.cash, 50);
});
