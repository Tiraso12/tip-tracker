import React from 'react';
import styles from './ShiftSetup.module.css';

function AssignedEmployeeRow({ member, onDragStart, onRemove, isRunner }) {
    const pointsLabel = member.points === null || member.points === undefined || member.points === ""
        ? "Auto pts"
        : `${member.points} pts`;

    return (
        <div
            className={styles.assignedRow}
            draggable
            onDragStart={onDragStart}
        >
            <div className={styles.rowHandle}>⋮⋮</div>
            <div className={styles.rowName}>
                {member.name}
            </div>

            {isRunner ? (
                <span className={styles.assignmentMeta}>Runner</span>
            ) : (
                <span className={styles.assignmentMeta}>{pointsLabel}</span>
            )}

            <button className={styles.removeBtn} onClick={onRemove}>✕</button>
        </div>
    );
}

export default React.memo(AssignedEmployeeRow, (prevProps, nextProps) => {
    return prevProps.member.points === nextProps.member.points &&
        prevProps.member.isCaptainActive === nextProps.member.isCaptainActive &&
        prevProps.member.payoutAmount === nextProps.member.payoutAmount &&
        prevProps.member.uid === nextProps.member.uid &&
        prevProps.isRunner === nextProps.isRunner;
});
