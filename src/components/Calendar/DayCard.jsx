import React from "react";
import { getNonCashDayTotal } from "../../utils/employeeSummary";

const roleLabels = {
    captain: "Captain",
    server: "Server",
    back: "Back Server",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

const fmt = (value) =>
    (Number(value) || 0).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
    });

function WeekCard({ data, total, hasPayout, roleLabel, title }) {
    // An empty day collapses to a compact muted row rather than a full $0.00 card,
    // so the days actually worked stand out at a glance.
    if (!hasPayout) {
        return (
            <div className="h-full flex items-center justify-between gap-2 px-4 py-3 border border-dashed border-[var(--color-line)] bg-[var(--color-surface-muted)]/40 rounded-[var(--radius-md)]">
                <span className="font-display text-sm font-medium tracking-tight text-[var(--color-ink-muted)]">
                    {title}
                </span>
                <span className="text-xs text-[var(--color-ink-muted)]">No payout</span>
            </div>
        );
    }

    return (
        <div
            className={
                "h-full flex flex-col p-4 bg-[var(--color-surface)] border rounded-[var(--radius-md)] " +
                "transition-colors duration-150 " +
                "border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
            }
        >
            <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="min-w-0 truncate font-display text-base font-medium tracking-tight text-[var(--color-ink)]">
                    {title}
                </h3>
                {roleLabel ? (
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded-[var(--radius-xs)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                        {roleLabel}
                    </span>
                ) : null}
            </div>

            <dl className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                    <dt className="text-[var(--color-ink-soft)]">Gratuity</dt>
                    <dd className="font-mono tabular-nums text-[var(--color-ink)]">{fmt(data.gratuity)}</dd>
                </div>
                <div className="flex items-center justify-between">
                    <dt className="text-[var(--color-ink-soft)]">Tip</dt>
                    <dd className="font-mono tabular-nums text-[var(--color-ink)]">{fmt(data.tip)}</dd>
                </div>
                <div className="flex items-center justify-between">
                    <dt className="text-[var(--color-ink-soft)]">Cash</dt>
                    <dd className="font-mono tabular-nums text-[var(--color-ink)]">{fmt(data.cash)}</dd>
                </div>
            </dl>

            <div className="mt-3 pt-3 border-t border-[var(--color-line)] flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
                    Total (G+T)
                </span>
                <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                    {fmt(total)}
                </strong>
            </div>

            {data.points !== undefined && data.points !== null && data.points !== "" ? (
                <p className="mt-2 text-[11px] font-mono tabular-nums text-[var(--color-ink-muted)] text-right">
                    {Number(data.points)} pts
                </p>
            ) : null}
        </div>
    );
}

function MonthCell({ total, hasPayout, title, roleLabel }) {
    return (
        <div className="h-full flex flex-col justify-between p-2 text-left">
            <div className="flex items-center justify-between gap-1">
                <span
                    className={
                        "text-xs font-medium tabular-nums " +
                        (hasPayout
                            ? "text-[var(--color-ink)]"
                            : "text-[var(--color-ink-muted)]")
                    }
                >
                    {title}
                </span>
                {roleLabel ? (
                    <span
                        className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                        aria-label={roleLabel}
                        title={roleLabel}
                    />
                ) : null}
            </div>
            {hasPayout ? (
                <span className="mt-2 text-[11px] font-mono tabular-nums text-[var(--color-ink-soft)] truncate">
                    {fmt(total)}
                </span>
            ) : null}
        </div>
    );
}

function DayCard({ data, variant = "week" }) {
    const total = getNonCashDayTotal(data);
    const hasPayout =
        Number(data.gratuity || 0) +
        Number(data.tip || 0) +
        Number(data.cash || 0) > 0;
    const roleLabel = data.role ? roleLabels[data.role] || data.role : null;

    const d = new Date(data.date);
    const title =
        variant === "week"
            ? `${new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d)} ${d.getMonth() + 1}/${d.getDate()}`
            : d.getDate();

    if (variant === "month") {
        return (
            <MonthCell
                total={total}
                hasPayout={hasPayout}
                title={title}
                roleLabel={roleLabel}
            />
        );
    }

    return (
        <WeekCard
            data={data}
            total={total}
            hasPayout={hasPayout}
            roleLabel={roleLabel}
            title={title}
        />
    );
}

export default React.memo(DayCard, (prevProps, nextProps) => {
    return (
        prevProps.data.dateKey === nextProps.data.dateKey &&
        prevProps.data.gratuity === nextProps.data.gratuity &&
        prevProps.data.tip === nextProps.data.tip &&
        prevProps.data.cash === nextProps.data.cash &&
        prevProps.data.role === nextProps.data.role &&
        prevProps.data.points === nextProps.data.points &&
        prevProps.variant === nextProps.variant
    );
});
