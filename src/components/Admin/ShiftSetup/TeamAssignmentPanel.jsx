import React from 'react';
import styles from './ShiftSetup.module.css';
import TeamDropZone from './TeamDropZone';

export default function TeamAssignmentPanel({
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
                    title="Runners ($80 flat each)"
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
