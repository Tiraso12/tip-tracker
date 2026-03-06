import React from 'react';
import styles from './ShiftSetup.module.css';

export default function AssignedEmployeeRow({ member, onDragStart, onRemove, onUpdatePoints, isRunner }) {
    return (
        <div
            className={styles.assignedRow}
            draggable
            onDragStart={onDragStart}
        >
            <div className={styles.rowHandle}>⋮⋮</div>
            <div className={styles.rowName}>{member.name}</div>

            {isRunner ? (
                <div className={styles.flatPayLabel}>$80 flat</div>
            ) : (
                <div className={styles.pointsControl}>
                    <button
                        className={styles.ptsBtn}
                        onClick={() => onUpdatePoints(Math.max(0, (Number(member.points) || 0) - 0.5))}
                    >−</button>
                    <span className={styles.ptsValue}>{member.points}</span>
                    <button
                        className={styles.ptsBtn}
                        onClick={() => onUpdatePoints((Number(member.points) || 0) + 0.5)}
                    >+</button>
                </div>
            )}

            <button className={styles.removeBtn} onClick={onRemove}>✕</button>
        </div>
    );
}
