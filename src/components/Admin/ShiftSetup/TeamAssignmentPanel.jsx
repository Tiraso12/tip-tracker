import React from 'react';
import styles from './ShiftSetup.module.css';
import TeamDropZone from './TeamDropZone';
import { RUNNER_FLAT_RATE } from '../../../utils/distributionUtils';

function TeamAssignmentPanel({
    teams,
    barTeam,
    runners,
    onAddTeam,
    onRemoveTeam,
    dragOverId,
    selectedTeamId,
    onTeamClick,
    handlers
}) {
    return (
        <div className={styles.assignmentPanel}>

            {/* Restaurant Teams Controls */}
            <div className={styles.teamControls}>
                <span className={styles.tcLabel}>Restaurant Teams</span>
                <div className={styles.tcStepper}>
                    <button
                        className={styles.tcBtn}
                        onClick={onRemoveTeam}
                        disabled={teams.length <= 1}
                        title="Remove last team"
                    >−</button>
                    <span className={styles.tcValue}>{teams.length}</span>
                    <button
                        className={styles.tcBtn}
                        onClick={onAddTeam}
                        title="Add team"
                        disabled={teams.length >= 6}
                    >+</button>
                </div>
            </div>

            {/* All team cards in a 2-column card grid */}
            <div className={styles.teamGrid}>
                {teams.map((t, index) => (
                    <TeamDropZone
                        key={t.teamId}
                        teamId={t.teamId}
                        title={`Team ${index + 1}`}
                        members={t.members}
                        isOver={dragOverId === t.teamId}
                        isSelected={selectedTeamId === t.teamId}
                        onTeamClick={onTeamClick}
                        {...handlers}
                    />
                ))}

                {/* Bar Team */}
                <TeamDropZone
                    teamId="bar"
                    title="Bar Team"
                    members={barTeam.members}
                    isOver={dragOverId === 'bar'}
                    isSelected={selectedTeamId === 'bar'}
                    onTeamClick={onTeamClick}
                    {...handlers}
                />

                {/* Runners */}
                <TeamDropZone
                    teamId="runner"
                    title={`Runners ($${RUNNER_FLAT_RATE} flat each)`}
                    members={runners}
                    isRunner={true}
                    isOver={dragOverId === 'runner'}
                    isSelected={selectedTeamId === 'runner'}
                    onTeamClick={onTeamClick}
                    {...handlers}
                />
            </div>
        </div>
    );
}

export default React.memo(TeamAssignmentPanel, (prevProps, nextProps) => {
    // If teams length, bar members, or runners change, re-render
    if (prevProps.teams.length !== nextProps.teams.length) return false;
    if (prevProps.barTeam.members.length !== nextProps.barTeam.members.length) return false;
    if (prevProps.runners.length !== nextProps.runners.length) return false;

    // Selection or Over state change
    if (prevProps.dragOverId !== nextProps.dragOverId) return false;
    if (prevProps.selectedTeamId !== nextProps.selectedTeamId) return false;

    // Deep exact member comparison for restaurant teams
    for (let i = 0; i < prevProps.teams.length; i++) {
        const prevT = prevProps.teams[i];
        const nextT = nextProps.teams[i];
        if (prevT.teamId !== nextT.teamId) return false;
        if (prevT.members.length !== nextT.members.length) return false;
        for (let j = 0; j < prevT.members.length; j++) {
            if (prevT.members[j].uid !== nextT.members[j].uid) return false;
            if (prevT.members[j].points !== nextT.members[j].points) return false;
        }
    }

    return true; // Assume harmless properties haven't changed
});
