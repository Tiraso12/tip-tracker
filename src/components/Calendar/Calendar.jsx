import React, { useState } from "react";
import styles from "./Calendar.module.css";
<<<<<<< HEAD
import Card from "../Card/Card";
=======
import DayCard from "./DayCard";
>>>>>>> develop

function Calendar({ weekData, onUpdate }) {
  if (!weekData) return null;

  return (
    <div className={styles.calendar}>
      {weekData.map((day, index) => (
        <Card
          key={day.dateKey}
          data={day}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
export default Calendar;

