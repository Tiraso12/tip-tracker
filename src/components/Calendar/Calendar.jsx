import React, { useState } from "react";
import styles from "./Calendar.module.css";
import DayCard from "./DayCard";

function Calendar({ weekData, onUpdate }) {
  if (!weekData) return null;

  return (
    <div className={styles.calendar}>
      {weekData.map((day, index) => (
        <DayCard
          key={day.dateKey}
          data={day}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
export default Calendar;

