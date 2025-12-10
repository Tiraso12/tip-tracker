import React, { useState, useEffect } from "react";
import styles from "./Calendar.module.css";

function DayCard({ data, onUpdate, variant = "week" }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValues, setEditValues] = useState({
        gratuity: data.gratuity || "",
        tip: data.tip || "",
        cash: data.cash || ""
    });

    // Sync edits if props change externally (though less likely in edit mode)
    useEffect(() => {
        if (!isEditing) {
            setEditValues({
                gratuity: data.gratuity || "",
                tip: data.tip || "",
                cash: data.cash || ""
            });
        }
    }, [data, isEditing]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Allow only numbers and decimals
        if (value === "" || /^\d*\.?\d*$/.test(value)) {
            setEditValues(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleCardClick = () => {
        if (!isEditing) {
            setIsEditing(true);
        }
    };

    const handleCancel = (e) => {
        e.stopPropagation();
        // Reset values
        setEditValues({
            gratuity: data.gratuity || "",
            tip: data.tip || "",
            cash: data.cash || ""
        });
        setIsEditing(false);
    };

    const handleSave = (e) => {
        e.stopPropagation();
        // Pass updates up
        // We pass the dateKey so parent knows which record to update
        onUpdate(data.dateKey, "gratuity", editValues.gratuity);
        onUpdate(data.dateKey, "tip", editValues.tip);
        onUpdate(data.dateKey, "cash", editValues.cash);
        setIsEditing(false);
    };

    const currentTotal = (
        Number(isEditing ? editValues.gratuity : data.gratuity || 0) +
        Number(isEditing ? editValues.tip : data.tip || 0) +
        Number(isEditing ? editValues.cash : data.cash || 0)
    ).toFixed(2);

    const getTitle = () => {
        const d = new Date(data.date);
        // Simplified view for both as per premium design requirements
        return d.getDate();
    };

    return (
        <div
            className={`${styles.card} ${isEditing ? styles.editing : ''}`}
            onClick={handleCardClick}
        >
            <h1>{getTitle()}</h1>

            <div className={styles.row}>
                <span>gratuity</span>
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
                <span>tip</span>
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
                <span>cash</span>
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

            <div className={styles.footer}>
                {isEditing && (
                    <div className={styles.actions}>
                        <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
                        <button className={styles.saveBtn} onClick={handleSave}>Save</button>
                    </div>
                )}

            </div>
        </div>
    );
}

export default DayCard;

