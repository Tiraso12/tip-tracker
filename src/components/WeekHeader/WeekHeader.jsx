import React from "react";
import styles from "./WeekHeader.module.css";
import { formatDate } from "../../utils/dateUtils";

function WeekHeader({ startDate, endDate, onPrev, onNext, viewMode, onViewChange, currentDate }) {
  // Graceful fallback if dates aren't ready
  if (viewMode === 'week' && (!startDate || !endDate)) return null;
  if (viewMode === 'month' && !currentDate) return null;

  return (
    <div className={styles.container}>
      {/* View Toggle integrated into Header */}
      <div className={styles.toggle}>
        <button
          className={`${styles.toggleButton} ${viewMode === 'week' ? styles.active : ''}`}
          onClick={() => onViewChange('week')}
        >
          Week
        </button>
        <button
          className={`${styles.toggleButton} ${viewMode === 'month' ? styles.active : ''}`}
          onClick={() => onViewChange('month')}
        >
          Month
        </button>
      </div>

      <div className={styles.weekControl}>
        <button onClick={onPrev} className={styles.navButton} aria-label="Previous">
          &lt;
        </button>
        <div className={styles.content}>
          <h2 className={styles.title}>{viewMode === 'month' ? 'Month' : 'Week'}</h2>
          <p className={styles.dateRange}>
            {viewMode === 'month'
              ? currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
              : `${formatDate(startDate)} - ${formatDate(endDate)}`
            }
          </p>
        </div>
        <button onClick={onNext} className={styles.navButton} aria-label="Next">
          &gt;
        </button>
      </div>
    </div>
  );
}

export default WeekHeader;