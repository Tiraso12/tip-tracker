import FloatingActions from "../FloatingActions";
import { Spinner } from "../../ui";

// The floating action pair pinned to the bottom-right corner, shared by the Floor
// plan and Settle up editors so both screens enter/exit edit identically. Cancel is
// a neutral pill that never competes with the accent primary; each is its own 44px+
// tap target. (Single source of truth - do not fork a parallel FAB per screen.)
export function EditorActionPair({ onCancel, onPrimary, primaryLabel, busy }) {
    return (
        <FloatingActions>
            <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-3.5 text-sm font-semibold text-[var(--color-ink-soft)] shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-transform active:scale-95 disabled:opacity-60"
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={onPrimary}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95 disabled:opacity-60"
            >
                {busy ? <Spinner /> : null}
                {primaryLabel}
            </button>
        </FloatingActions>
    );
}
