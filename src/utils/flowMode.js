// Dev-only orchestration toggle for the admin day flow prototype.
//
// Two shells sit over the same floor-plan-first foundation:
//   "rail" - Approach A, the Day Rail (ordered step spine)
//   "hub"  - Approach B, the Day Home Base (checklist of stage cards)
//
// Selection resolves from, in order: a `?flow=rail|hub` query param (which also
// persists), then localStorage, then the default. This is a throwaway comparison
// switch, NOT a shipped user setting.

export const FLOW_MODES = ["rail", "hub"];
export const DEFAULT_FLOW_MODE = "rail";
const STORAGE_KEY = "tt.devFlowMode";

export function readFlowMode() {
    if (typeof window === "undefined") return DEFAULT_FLOW_MODE;

    try {
        const params = new URLSearchParams(window.location.search);
        const q = params.get("flow");
        if (q && FLOW_MODES.includes(q)) {
            try { window.localStorage.setItem(STORAGE_KEY, q); } catch { /* ignore */ }
            return q;
        }
    } catch { /* ignore */ }

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && FLOW_MODES.includes(stored)) return stored;
    } catch { /* ignore */ }

    return DEFAULT_FLOW_MODE;
}

export function writeFlowMode(mode) {
    if (!FLOW_MODES.includes(mode)) return;
    try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }

    // Keep the URL honest so a copied link reproduces the same shell.
    if (typeof window !== "undefined" && window.history?.replaceState) {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set("flow", mode);
            window.history.replaceState({}, "", url);
        } catch { /* ignore */ }
    }
}

export function flowModeLabel(mode) {
    return mode === "hub" ? "Home Base (B)" : "Day Rail (A)";
}
