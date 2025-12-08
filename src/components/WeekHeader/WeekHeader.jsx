import React from "react";
import styles from "./WeekHeader.module.css";
import { formatDate } from "../../utils/dateUtils";

function WeekHeader({ startDate, endDate, onPrev, onNext }) {
  if (!startDate || !endDate) return null;

  return (
    <div className={styles.weekHeader}>
      <button onClick={onPrev} className={styles.navButton} aria-label="Previous week">
        &lsaquo;
      </button>
      <div className={styles.content}>
        <h2 className={styles.title}>Week</h2>
        <p className={styles.dateRange}>
          Week of {formatDate(startDate)} to {formatDate(endDate)}
        </p>
      </div>
      <button onClick={onNext} className={styles.navButton} aria-label="Next week">
        &rsaquo;
      </button>
    </div>
  );
}

export default WeekHeader;