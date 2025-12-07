import React from "react";
import styles from "./Summary.module.css";

import { formatDate } from "../../utils/dateUtils";

function Summary({ weekData }) {
  if (!weekData || weekData.length === 0) return null;

  const startDate = weekData[0].date;
  const endDate = weekData[weekData.length - 1].date;

  const totalGratuity = weekData.reduce((sum, day) => sum + (Number(day.gratuity) || 0), 0);
  const totalTip = weekData.reduce((sum, day) => sum + (Number(day.tip) || 0), 0);
  const totalCash = weekData.reduce((sum, day) => sum + (Number(day.cash) || 0), 0);
  const grandTotal = totalGratuity + totalTip + totalCash;

  const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className={styles.summary}>
      <h2 className={styles.title}>SUMMARY</h2>
      <div className={styles.subtitle}>
        {formatDate(startDate)} - {formatDate(endDate)}
      </div>
      <div className={styles.row}><span>Total gratuity</span><span>{fmt(totalGratuity)}</span></div>
      <div className={styles.row}><span>Total tip</span><span>{fmt(totalTip)}</span></div>
      <div className={styles.row}><span>Total cash</span><span>{fmt(totalCash)}</span></div>
      <div className={styles.row}><span>total this week</span><strong>{fmt(grandTotal)}</strong></div>
    </div>
  );
}
export default Summary;
