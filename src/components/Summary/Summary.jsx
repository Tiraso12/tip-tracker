import React from "react";
import styles from "./Summary.module.css";

function Summary() {
  return (
    <div className={styles.summary}>
      <h2 className={styles.title}>SUMMARY</h2>
      <div className={styles.row}><span>Total gratuity</span><span>$---</span></div>
      <div className={styles.row}><span>Total tip</span><span>$---</span></div>
      <div className={styles.row}><span>Total cash</span><span>$---</span></div>
      <div className={styles.row}><span>total this week</span><span>$---</span></div>
    </div>
  );
}
export default Summary;
