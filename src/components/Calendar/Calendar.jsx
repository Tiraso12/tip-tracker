import React from "react";
import styles from "./Calendar.module.css";
import Card from "../Card/Card";

function Calendar({ weekData, onUpdate }) {
  if (!weekData) return null;

  return (
    <div className={styles.calendar}>
      {weekData.map((day, index) => (
        <Card
          key={day.dateKey}
          data={day}
          index={index}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
export default Calendar;
