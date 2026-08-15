import { NUMERIC_INPUT } from "./numericInputClass";

// `badge` rides on the label line and `note` sits under the input. Both exist for one
// field - the bar's Runners Fee, which is derived from food sales and says so - so they
// are deliberately plain slots rather than a derivation-aware field: nothing else on a
// settle card should grow chrome because that one field needed it.
export function PoolField({ label, value, onChange, money = true, badge = null, note = null }) {
    const id = `pool-field-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return (
        <div className="flex flex-col gap-1.5">
            {/* Fixed-height label line. A badge is taller than the label text, and these
                fields sit side by side in a grid row - left to grow, the one field
                carrying a badge would push its input a few pixels below its neighbour's
                and break the row the whole card is read across. */}
            <div className="flex h-4 items-center gap-1.5 min-w-0">
                <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-soft)]">
                    {label}
                </label>
                {badge}
            </div>
            <div className="relative flex items-center">
                {money ? (
                    <span className="absolute left-3 text-[13px] text-[var(--color-ink-muted)] pointer-events-none">$</span>
                ) : null}
                <input
                    id={id}
                    type="number"
                    inputMode={money ? "decimal" : "numeric"}
                    min="0"
                    step="0.01"
                    className={NUMERIC_INPUT + (money ? " !pl-6" : "")}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={money ? "0.00" : "0"}
                    aria-label={label}
                />
            </div>
            {note ? (
                <span className="text-[10.5px] leading-snug text-[var(--color-ink-muted)]">{note}</span>
            ) : null}
        </div>
    );
}
