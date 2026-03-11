/**
 * distributionUtils.js
 * 
 * Shared constants and utility functions for tip-out distribution.
 */

export const ROLE_POINTS = {
    captain: 4,
    front: 4,
    back: 2.5,
    busser: 2,
};

export const RUNNER_FLAT_RATE = 102;

export const ROLE_LABELS = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: `Runner (flat $${RUNNER_FLAT_RATE})`,
};

export const ROLE_ORDER = ["captain", "server", "back", "assistant", "bartender", "runner"];
