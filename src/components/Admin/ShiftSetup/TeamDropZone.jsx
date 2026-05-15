import React from 'react';
import styles from './ShiftSetup.module.css';
import AssignedEmployeeRow from './AssignedEmployeeRow';

function TeamDropZone({
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
    onRemove
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
                    />
                ))
            )}
        </div>
    );
}

export default React.memo(TeamDropZone, (prevProps, nextProps) => {
    // Re-render if selection or hover state changes
    if (prevProps.isOver !== nextProps.isOver) return false;
    if (prevProps.isSelected !== nextProps.isSelected) return false;
    // Re-render if name/title changes
    if (prevProps.title !== nextProps.title) return false;
    // Re-render if members list changes length or deep content
    if (prevProps.members.length !== nextProps.members.length) return false;
    for (let i = 0; i < prevProps.members.length; i++) {
        if (prevProps.members[i].uid !== nextProps.members[i].uid) return false;
        if (prevProps.members[i].points !== nextProps.members[i].points) return false;
        if (prevProps.members[i].isCaptainActive !== nextProps.members[i].isCaptainActive) return false;
        if (prevProps.members[i].payoutAmount !== nextProps.members[i].payoutAmount) return false;
        if (prevProps.members[i].fundingSourceMode !== nextProps.members[i].fundingSourceMode) return false;
        if (prevProps.members[i].sourceA !== nextProps.members[i].sourceA) return false;
        if (prevProps.members[i].sourceB !== nextProps.members[i].sourceB) return false;
        if (prevProps.members[i].amountFromSourceA !== nextProps.members[i].amountFromSourceA) return false;
        if (prevProps.members[i].percentFromSourceA !== nextProps.members[i].percentFromSourceA) return false;
    }
    return true;
});
