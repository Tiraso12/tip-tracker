import { formatDayName } from "../../utils/dateUtils";

// Pullenberg kit's `DayChip` (ui_kits/app/WorkspaceScreen.jsx), painted onto the
// shift workspace: a Friday-anchored work week (the same boundary the pay side
// already uses, `getCurrentWeek`) of 58px cells, weekday label above a date
// number, a status dot below. Kit models only "today" as special; this app also
// has a SELECTED day that is not necessarily today, so that gets its own accent
// treatment - a distinction the kit's static mock never needed to make.
//
// Real navigation, not decoration: each cell calls `onSelect(dateKey)`, wired to
// the same `setSelectedDate` the app-bar date pill already drives - one shared
// notion of "the selected day," two ways to move it.
function DayChip({ dateKey, label, dayNumber, isToday, isSelected, status, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(dateKey)}
            aria-current={isSelected ? "date" : undefined}
            className={[
                "flex-1 min-w-0 h-[58px] flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] border transition-colors",
                isToday
                    ? "border-[var(--color-accent)] bg-[var(--color-bar-bg)]"
                    : isSelected
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-line-strong)]",
            ].join(" ")}
        >
            <span
                className={[
                    "text-[10px] uppercase tracking-[0.08em]",
                    isToday ? "text-[var(--color-bar-ink)]/70" : "text-[var(--color-ink-muted)]",
                ].join(" ")}
            >
                {label}
            </span>
            <span
                className={[
                    "text-base font-semibold",
                    isToday ? "text-[var(--color-bar-ink-soft)]" : "text-[var(--color-ink)]",
                ].join(" ")}
            >
                {dayNumber}
            </span>
            <span
                aria-hidden="true"
                className={[
                    "h-[5px] w-[5px] rounded-full",
                    status === "closed" ? "bg-[var(--color-success)]" : status === "setup" ? "bg-[var(--color-warning)]" : "bg-transparent",
                ].join(" ")}
            />
        </button>
    );
}

// `days`: array of `{ dateKey, date }` for the week, in order. `statuses`: map
// of dateKey -> shift status ("setup" | "closed" | undefined), a lightweight
// week-wide read separate from the full day fetch - see AdminDashboard's
// `weekStatuses`. A day with payout records but no shift doc (the orphaned-
// payouts shape) has no entry here and reads as "none" - a glance indicator,
// not the source of truth DayRailLanding itself reads for that date.
function DayChipStrip({ days, statuses, selectedDate, todayKey, onSelect }) {
    return (
        <div className="flex gap-1.5 sm:gap-2" role="group" aria-label="Select a day this week">
            {days.map(({ dateKey, date }) => (
                <DayChip
                    key={dateKey}
                    dateKey={dateKey}
                    label={formatDayName(date).slice(0, 3).toUpperCase()}
                    dayNumber={date.getDate()}
                    isToday={dateKey === todayKey}
                    isSelected={dateKey === selectedDate}
                    status={statuses[dateKey]}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}

export default DayChipStrip;
