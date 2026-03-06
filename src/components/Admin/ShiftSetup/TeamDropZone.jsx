import React from 'react';
import styles from './ShiftSetup.module.css';
import AssignedEmployeeRow from './AssignedEmployeeRow';

export default function TeamDropZone({
    teamId,
    title,
    members,
    isRunner,
    isOver,
    isSelected,
    onTeamClick,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragStart,
    onRemove,
    onUpdatePoints
}) {
    return (
        <div
            className={`${styles.dropZone} ${isOver ? styles.isOver : ''} ${isSelected ? styles.isSelected : ''}`}
            onDragOver={(e) => onDragOver(e, teamId)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, teamId)}
        >
            <div
                className={`${styles.teamHeader} ${styles.teamHeaderClickable}`}
                onClick={() => onTeamClick(teamId)}
                title={isSelected ? 'Click to deselect' : 'Click to select this team, then click employees to assign'}
            >
                <h4 className={styles.teamName}>
                    {isSelected && <span className={styles.selectedDot}>●</span>}
                    {title}
                </h4>
                <span className={styles.teamCount}>
                    {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
            </div>

            {members.length === 0 ? (
                <div className={styles.teamPlaceholder}>
                    {isSelected ? 'Click employees from the list →' : 'Drag employees here'}
                </div>
            ) : (
                members.map(member => (
                    <AssignedEmployeeRow
                        key={member.uid}
                        member={member}
                        isRunner={isRunner}
                        onDragStart={(e) => onDragStart(e, member.uid, teamId)}
                        onRemove={() => onRemove(member.uid, teamId)}
                        onUpdatePoints={(pts) => onUpdatePoints(teamId, member.uid, pts)}
                    />
                ))
            )}
        </div>
    );
}
