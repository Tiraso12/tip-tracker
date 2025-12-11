import React, { useState, useEffect } from "react";
import styles from "./Calendar.module.css";
import DayCard from "./DayCard";

function Calendar({ weekData, onUpdate }) {
  const [activeDateKey, setActiveDateKey] = useState(null);

  // Close active card when clicking outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveDateKey(null);
    };

    // Use capture or just standard bubble on window/document
    // We need to ensure card click stops propagation (handled in DayCard)
    window.addEventListener('click', handleGlobalClick);

    return () => {
      window.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  if (!weekData) return null;

  return (
    <div className={styles.calendar}>
      {weekData.map((day, index) => (
        <DayCard
          key={day.dateKey}
          data={day}
          onUpdate={onUpdate}
          isEditing={activeDateKey === day.dateKey}
          onEditStart={() => setActiveDateKey(day.dateKey)}
          onCancel={() => setActiveDateKey(null)}
        />
      ))}
    </div>
  );
}
export default Calendar;

