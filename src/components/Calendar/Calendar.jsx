import React from "react";
import styles from "./Calendar.module.css";
import { formatDayName } from "../../utils/dateUtils";

function DayCard({ data, index, onUpdate }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    // Allow only numbers and decimals
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      onUpdate(index, name, value);
    }
  };

  return (
    <div className={styles.card}>
      <h1>{formatDayName(data.date)} {data.date.getMonth() + 1}/{data.date.getDate()}</h1>
      <div className={styles.row}>
        <span>gratuity</span>
        <input
          type="text"
          name="gratuity"
          value={data.gratuity}
          onChange={handleChange}
          placeholder="-"
          className={styles.input}
          autoComplete="off"
          inputMode="decimal"
        />
      </div>
      <div className={styles.row}>
        <span>tip</span>
        <input
          type="text"
          name="tip"
          value={data.tip}
          onChange={handleChange}
          placeholder="-"
          className={styles.input}
          autoComplete="off"
          inputMode="decimal"

        />
      </div>
      <div className={styles.row}>
        <span>cash</span>
        <input
          type="text"
          name="cash"
          value={data.cash}
          onChange={handleChange}
          placeholder="-"
          className={styles.input}
          autoComplete="off"
          inputMode="decimal"
        />
      </div>
      <div className={styles.row}>
        <strong>Total</strong>
        <strong>
          $
          {(Number(data.gratuity || 0) + Number(data.tip || 0) + Number(data.cash || 0)).toFixed(2)}
        </strong>
      </div>
    </div>
  );
}

function Calendar({ weekData, onUpdate }) {
  if (!weekData) return null;

  return (
    <div className={styles.calendar}>
      {weekData.map((day, index) => (
        <DayCard
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
