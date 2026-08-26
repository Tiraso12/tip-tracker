// Where the app was left, so a reload returns the viewer to the same screen
// instead of always landing back on My pay. Kept in localStorage, keyed by
// uid - never the URL (no react-router) and never a shared key, so two
// people on one phone each keep their own place and a login switch never
// shows the outgoing person's screen. Structural validation only: no money
// fields are stored, and no server truth is checked here - the caller
// (App.jsx / AdminDashboard.jsx) is responsible for permission-based
// fallback (e.g. a restored "workspace" surface for someone who can no
// longer open it).
const STORAGE_PREFIX = "tip-tracker:place:";

const SURFACES = new Set(["pay", "workspace", "account"]);
const WORKSPACE_TABS = new Set(["shifts", "editor", "users"]);
const EDITOR_STEPS = new Set(["floor", "settle", "review"]);
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value) {
    if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function keyFor(uid) {
    return `${STORAGE_PREFIX}${uid}`;
}

// Anything shaped wrong (hand-edited, from an older version, or simply
// absent) is treated as "nothing saved" rather than thrown - a reload must
// never break because of a stale localStorage entry.
export function loadPlace(uid) {
    if (!uid || typeof window === "undefined") return null;

    let raw;
    try {
        raw = window.localStorage.getItem(keyFor(uid));
    } catch {
        return null;
    }
    if (!raw) return null;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object" || !SURFACES.has(parsed.surface)) return null;

    if (parsed.surface !== "workspace") {
        return { surface: parsed.surface };
    }

    const ws = parsed.workspace;
    if (!ws || typeof ws !== "object" || !WORKSPACE_TABS.has(ws.tab) || !isValidDateKey(ws.date)) {
        return { surface: "workspace" };
    }

    return {
        surface: "workspace",
        workspace: {
            tab: ws.tab,
            date: ws.date,
            editorStep: EDITOR_STEPS.has(ws.editorStep) ? ws.editorStep : "floor",
            settleGroupId: typeof ws.settleGroupId === "string" ? ws.settleGroupId : null,
        },
    };
}

// Best-effort write. Private browsing / a full quota just loses this note -
// the next reload falls back to today's default, same as having never saved
// one.
export function savePlace(uid, place) {
    if (!uid || typeof window === "undefined") return;
    try {
        window.localStorage.setItem(keyFor(uid), JSON.stringify(place));
    } catch {
        // Nothing to recover - see comment above.
    }
}

// Whether it is safe, right now, to persist a top-level surface for this uid.
// A restore-then-save pair of effects (App.jsx) fires in the SAME commit the
// moment `user.uid` first becomes available: the restore effect calls
// setSurface(...) but that update is only scheduled, not applied yet, so a
// save effect with no guard would still see the pre-restore default ("pay")
// and overwrite the just-restored note before it was ever rendered. Gating
// the save on `restoredUid === uid` - a piece of STATE the restore effect
// sets alongside setSurface, not a ref - forces one extra render between
// "restore decided" and "save is allowed to run," so save only ever writes
// a surface value that has actually been rendered.
export function canPersistSurface({ uid, restoredUid }) {
    return Boolean(uid) && restoredUid === uid;
}
