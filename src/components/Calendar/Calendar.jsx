import React from "react";
import styles from "./Calendar.module.css";
import Card from "../Card/Card";


function Calendar() {
  return (
    <div className={styles.calendar}>
      <Card />
      <Card />
      <Card />
      <Card />
      <Card />
      <Card />
      <Card />
    </div>
  );
}
export default Calendar;
