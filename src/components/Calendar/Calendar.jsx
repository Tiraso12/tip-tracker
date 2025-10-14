import React from "react";
import styles from "./Calendar.module.css";

function Card() {
  return (
    <div className={styles.card}>
      <h1>Date</h1>
      <div className={styles.row}><span>gratuity</span><span>—</span></div>
      <div className={styles.row}><span>tip</span><span>—</span></div>
      <div className={styles.row}><span>cash</span><span>—</span></div>
      <div className={styles.row}><span>total</span><span>—</span></div>
    </div>
  );
}

function Calendar() {
  return (
    <div className={styles.calendar}>
      <Card /><Card /><Card /><Card /><Card /><Card /><Card />
    </div>
  );
}
export default Calendar;
