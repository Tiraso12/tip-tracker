import React, {useState} from "react";
import styles from "./Card.module.css";

function Card() {

  return (
    <div className={styles.card} >
      <h1>Date</h1>
      <div className={styles.row}><span>gratuity</span><span>—</span></div>
      <div className={styles.row}><span>tip</span><span>—</span></div>
      <div className={styles.row}><span>cash</span><span>—</span></div>
      <div className={styles.row}><span>total</span><span>—</span></div>
    </div>
  );
}

export default Card;