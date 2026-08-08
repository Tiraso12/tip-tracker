import { Card } from "../ui";

// Approach B - "The Day Home Base".
// The landing IS a hub: a vertical checklist of the day's three stages, each
// showing status. Tapping a stage opens its focused screen; you return here
// between stages. Best at orientation - the whole day is always visible.

function friendlyDate(dateKey) {
    try {
        const d = new Date(dateKey + "T12:00:00");
        return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    } catch {
        return dateKey;
    }
}

const STATUS_CHIP = {
    done: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
    active: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
    locked: "bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]",
};

function StageCard({ index, title, hint, statusKind, statusLabel, cta, onClick }) {
    const clickable = Boolean(onClick);
    const raised = statusKind === "active";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!clickable}
            className={
                "group flex w-full items-center gap-3.5 rounded-[var(--radius-md)] border p-4 text-left transition-all " +
                (raised
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-surface)] shadow-sm "
                    : "border-[var(--color-line)] bg-[var(--color-surface)] ") +
                (clickable
                    ? "hover:border-[var(--color-line-strong)] hover:shadow-sm cursor-pointer "
                    : "opacity-70 cursor-default ")
            }
        >
            <span
                className={
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums " +
                    (statusKind === "done"
                        ? "bg-[var(--color-accent)] text-white"
                        : statusKind === "active"
                            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                            : "bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]")
                }
            >
                {statusKind === "done" ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    index
                )}
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                    <span className="font-display text-base font-medium tracking-tight text-[var(--color-ink)]">
                        {title}
                    </span>
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] " + STATUS_CHIP[statusKind]}>
                        {statusLabel}
                    </span>
                </span>
                <span className="truncate text-xs text-[var(--color-ink-soft)]">{hint}</span>
            </span>

            {clickable ? (
                <span
                    className={
                        "shrink-0 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium " +
                        (raised
                            ? "bg-[var(--color-accent)] text-white"
                            : "text-[var(--color-accent)] group-hover:bg-[var(--color-accent-soft)]")
                    }
                >
                    {cta}
                </span>
            ) : (
                <span className="shrink-0 text-[var(--color-ink-muted)]" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                </span>
            )}
        </button>
    );
}

function DayHomeBase({ date, status, loading, onOpenFloor, onOpenSettle, onViewPayout }) {
    const floorDone = status === "setup" || status === "closed";
    const closed = status === "closed";

    if (loading) {
        return (
            <Card className="px-6 py-16 text-center text-sm text-[var(--color-ink-soft)]">
                Loading day…
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                    Today
                </span>
                <h2 className="font-display text-xl font-medium tracking-tight text-[var(--color-ink)]">
                    {friendlyDate(date)}
                </h2>
                <p className="text-xs text-[var(--color-ink-soft)]">
                    {closed
                        ? "Shift closed and paid out. Everything below is done."
                        : floorDone
                            ? "Floor plan is set - settle up when service ends."
                            : "Let's set up the floor to start the day."}
                </p>
            </div>

            <div className="space-y-2.5">
                <StageCard
                    index="1"
                    title="Floor plan"
                    hint="Build the shift lineup - teams, bar, runners"
                    statusKind={floorDone ? "done" : "active"}
                    statusLabel={floorDone ? "Done" : "Start here"}
                    cta={floorDone ? "Edit" : "Build"}
                    onClick={onOpenFloor}
                />
                <StageCard
                    index="2"
                    title="Settle up"
                    hint="Enter end-of-service money, then review"
                    statusKind={closed ? "done" : floorDone ? "active" : "locked"}
                    statusLabel={closed ? "Done" : floorDone ? "Ready" : "Locked"}
                    cta={closed ? "Adjust" : "Settle up"}
                    onClick={floorDone ? onOpenSettle : undefined}
                />
                <StageCard
                    index="3"
                    title="Pay out"
                    hint="The day's payout and distribution"
                    statusKind={closed ? "done" : "locked"}
                    statusLabel={closed ? "Ready" : "Locked"}
                    cta="View payout"
                    onClick={closed ? onViewPayout : undefined}
                />
            </div>
        </div>
    );
}

export default DayHomeBase;
