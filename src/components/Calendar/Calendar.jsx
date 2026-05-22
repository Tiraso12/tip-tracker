import React from "react";
import DayCard from "./DayCard";

// Calendar is purely read-only.
function Calendar({ weekData }) {
  if (!weekData) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
      {weekData.map((day) => (
        <DayCard key={day.dateKey} data={day} variant="week" />
      ))}
    </div>
  );
}

export default Calendar;
