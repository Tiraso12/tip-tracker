import { FLOW_MODES, flowModeLabel } from "../../utils/flowMode";

const SHORT = { rail: "A", hub: "B" };

// A deliberately marked, dev-only control that flips the admin day flow between
// Approach A (Day Rail) and Approach B (Home Base) live, no rebuild. It lives
// inline in the app bar so it never covers a screen's primary CTA. This is
// prototype scaffolding for comparison - NOT a shipped user setting.
function FlowDevSwitcher({ flowMode, onChange }) {
    return (
        <div
            className="flex items-center gap-1 rounded-full border border-dashed border-[var(--color-accent)]/50 bg-[var(--color-surface)] px-1.5 py-1"
            role="group"
            aria-label="Developer flow switcher (A: Day Rail, B: Home Base)"
            title="Dev only: switch the admin day flow between Approach A (Day Rail) and Approach B (Home Base)"
        >
            <span className="pl-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)] max-[400px]:hidden">
                Flow
            </span>
            {FLOW_MODES.map((mode) => {
                const active = mode === flowMode;
                return (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => onChange(mode)}
                        aria-pressed={active}
                        title={flowModeLabel(mode)}
                        className={
                            "h-6 min-w-6 rounded-full px-2 text-[11px] font-semibold transition-colors " +
                            (active
                                ? "bg-[var(--color-accent)] text-white"
                                : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]")
                        }
                    >
                        {SHORT[mode]}
                    </button>
                );
            })}
        </div>
    );
}

export default FlowDevSwitcher;
