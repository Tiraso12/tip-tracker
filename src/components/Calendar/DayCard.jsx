import React, { useState, useEffect } from "react";
import styles from "./Calendar.module.css";



function DayCard({ data, onUpdate, isEditing, onEditStart, onCancel, variant = 'week', readOnly = false }) {
    const [editValues, setEditValues] = useState({
        gratuity: data.gratuity || "",
        tip: data.tip || "",
        cash: data.cash || ""
    });

    // Reset values when entering edit mode or when data changes
    useEffect(() => {
        setEditValues({
            gratuity: data.gratuity || "",
            tip: data.tip || "",
            cash: data.cash || ""
        });
    }, [data, isEditing]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Allow only numbers and decimals
        if (value === "" || /^\d*\.?\d*$/.test(value)) {
            setEditValues(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleCardClick = (e) => {
        e.stopPropagation();
        if (!isEditing && !readOnly) {
            onEditStart();
        }
    };

    const handleCancelClick = (e) => {
        e.stopPropagation();
        onCancel();
    };

    const handleSave = (e) => {
        e.stopPropagation();
        console.log("DayCard.handleSave:", data.dateKey, editValues); // DEBUG
        // Pass batch update
        onUpdate(data.dateKey, editValues);
        onCancel(); // Close edit mode after save
    };

    const currentTotal = (
        Number(isEditing ? editValues.gratuity : data.gratuity || 0) +
        Number(isEditing ? editValues.tip : data.tip || 0) +
        Number(isEditing ? editValues.cash : data.cash || 0)
    ).toFixed(2);

    const getTitle = () => {
        const d = new Date(data.date);
        if (variant === 'week') {
            const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
            return `${dayName} ${d.getMonth() + 1}/${d.getDate()}`;
        }
        return d.getDate();
    };

    return (
        <div
            className={`${styles.card} ${isEditing ? styles.editing : ''}`}
            onClick={handleCardClick}
        >
            <h1>{getTitle()}</h1>

            <div className={styles.row}>
                <span>Gratuity</span>
                {isEditing ? (
                    <input
                        type="text"
                        name="gratuity"
                        value={editValues.gratuity}
                        onChange={handleChange}
                        placeholder="-"
                        className={styles.input}
                        autoComplete="off"
                        inputMode="decimal"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className={styles.value}>${data.gratuity || "0"}</span>
                )}
            </div>

            <div className={styles.row}>
                <span>Tip</span>
                {isEditing ? (
                    <input
                        type="text"
                        name="tip"
                        value={editValues.tip}
                        onChange={handleChange}
                        placeholder="-"
                        className={styles.input}
                        autoComplete="off"
                        inputMode="decimal"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className={styles.value}>${data.tip || "0"}</span>
                )}
            </div>

            <div className={styles.row}>
                <span>Cash</span>
                {isEditing ? (
                    <input
                        type="text"
                        name="cash"
                        value={editValues.cash}
                        onChange={handleChange}
                        placeholder="-"
                        className={styles.input}
                        autoComplete="off"
                        inputMode="decimal"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className={styles.value}>${data.cash || "0"}</span>
                )}
            </div>

            <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalAmount}>${currentTotal}</span>
            </div>

            {!readOnly && (
                <div className={styles.footer}>
                    {isEditing && (
                        <div className={styles.actions}>
                            <button className={styles.cancelBtn} onClick={handleCancelClick}>Cancel</button>
                            <button className={styles.saveBtn} onClick={handleSave}>Save</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


export default DayCard;

