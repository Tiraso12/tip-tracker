import React from "react";
import styles from "./Calendar.module.css";
import DayCard from "./DayCard";

// Calendar is purely read-only.
function Calendar({ weekData }) {
  if (!weekData) return null;

  return (
    <div className={styles.calendar}>
      {weekData.map((day) => (
        <DayCard
          key={day.dateKey}
          data={day}
          variant="week"
        />
      ))}
    </div>
  );
}

export default Calendar;
