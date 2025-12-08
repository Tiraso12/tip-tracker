import React, { useState, useEffect } from "react";
import styles from "./Card.module.css";
import { formatDayName } from "../../utils/dateUtils";

function Card({ data, index, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ ...data });

  // Sync editData when prop data changes (unless editing)
  useEffect(() => {
    if (!isEditing) {
      setEditData({ ...data });
    }
  }, [data, isEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setEditData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = () => {
    // Commit only changed values
    if (editData.gratuity !== data.gratuity) onUpdate(index, "gratuity", editData.gratuity);
    if (editData.tip !== data.tip) onUpdate(index, "tip", editData.tip);
    if (editData.cash !== data.cash) onUpdate(index, "cash", editData.cash);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({ ...data });
    setIsEditing(false);
  };

  const total = (Number(isEditing ? editData.gratuity : data.gratuity) || 0) +
    (Number(isEditing ? editData.tip : data.tip) || 0) +
    (Number(isEditing ? editData.cash : data.cash) || 0);

  return (
    <div className={`${styles.card} ${isEditing ? styles.editing : ''}`}>
      <h1>{formatDayName(data.date)} {data.date.getMonth() + 1}/{data.date.getDate()}</h1>
      <div className={styles.row}>
        <span>Grat</span>
        {isEditing ? (
          <input
            type="text"
            name="gratuity"
            value={editData.gratuity}
            onChange={handleChange}
            placeholder="-"
            className={styles.input}
            autoComplete="off"
            inputMode="decimal"
          />
        ) : (
          <span className={styles.value}>{data.gratuity || "—"}</span>
        )}
      </div>
      <div className={styles.row}>
        <span>Tip</span>
        {isEditing ? (
          <input
            type="text"
            name="tip"
            value={editData.tip}
            onChange={handleChange}
            placeholder="-"
            className={styles.input}
            autoComplete="off"
            inputMode="decimal"
          />
        ) : (
          <span className={styles.value}>{data.tip || "—"}</span>
        )}
      </div>
      <div className={styles.row}>
        <span>Cash</span>
        {isEditing ? (
          <input
            type="text"
            name="cash"
            value={editData.cash}
            onChange={handleChange}
            placeholder="-"
            className={styles.input}
            autoComplete="off"
            inputMode="decimal"
          />
        ) : (
          <span className={styles.value}>{data.cash || "—"}</span>
        )}
      </div>
      <div className={styles.row}>
        <strong>Total</strong>
        <strong>${total.toFixed(2)}</strong>
      </div>

      <div className={styles.controls}>
        {isEditing ? (
          <>
            <button className={`${styles.button} ${styles.cancel}`} onClick={handleCancel}>
              Cancel
            </button>
            <button className={`${styles.button} ${styles.save}`} onClick={handleSave}>
              Save
            </button>
          </>
        ) : (
          <button className={styles.button} onClick={() => setIsEditing(true)}>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

export default Card;