import React from "react";
import DayCard from "./DayCard";

const dayHasPayout = (day) =>
  Number(day.gratuity || 0) + Number(day.tip || 0) + Number(day.cash || 0) > 0;

// Calendar is purely read-only.
function Calendar({ weekData }) {
  if (!weekData) return null;

  // When the whole week is empty, show one compact week-level empty state
  // instead of seven full "$0.00" cards.
  if (!weekData.some(dayHasPayout)) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-muted)]/40 px-4 py-10 text-center">
        <p className="text-sm text-[var(--color-ink-muted)]">
          No payouts recorded this week.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
      {weekData.map((day) => (
        <DayCard key={day.dateKey} data={day} variant="week" />
      ))}
    </div>
  );
}

export default Calendar;
