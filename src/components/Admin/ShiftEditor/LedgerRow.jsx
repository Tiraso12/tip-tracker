// One row of the Shift totals ledger. Label left, figure right, both on the same
// baseline so the column of money reads straight down at a glance. `tone="warn"`
// is for a row that should stop a captain committing - it carries the warning
// colour on BOTH the label and the figure, because a ledger scanned down its money
// column would otherwise never register a colour change on the label alone.
export function LedgerRow({ label, sub, value, tone = "plain", testId }) {
    const isTotal = tone === "total";
    const isWarn = tone === "warn";
    return (
        <div className={"flex items-baseline justify-between gap-3 " + (isTotal ? "pt-2" : "")}>
            <span className="min-w-0">
                <span className={isTotal
                    ? "text-[12px] font-semibold text-[var(--color-ink)]"
                    : isWarn
                        ? "text-[12px] font-semibold text-[var(--color-warning)]"
                        : "text-[12px] text-[var(--color-ink-soft)]"}>
                    {label}
                </span>
                {sub ? (
                    <span className={"block text-[10.5px] leading-tight "
                        + (isWarn ? "text-[var(--color-warning)]" : "text-[var(--color-ink-muted)]")}>
                        {sub}
                    </span>
                ) : null}
            </span>
            <strong
                data-testid={testId}
                className={"shrink-0 font-mono tabular-nums "
                    + (isTotal
                        ? "text-[15px] font-semibold text-[var(--color-ink)]"
                        : isWarn
                            ? "text-[12.5px] font-semibold text-[var(--color-warning)]"
                            : "text-[12.5px] font-normal text-[var(--color-ink-soft)]")}>
                {value}
            </strong>
        </div>
    );
}
