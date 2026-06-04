import React from 'react';
import TeamDropZone from './TeamDropZone';
import { RUNNER_FLAT_RATE } from '../../../utils/constants';

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
    const restaurantMemberCount = teams.reduce((total, team) => total + team.members.length, 0);

    return (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-3 flex flex-col gap-2.5 overflow-y-auto max-h-full max-[900px]:order-1 max-[900px]:max-h-none max-[560px]:rounded-none max-[560px]:px-0 max-[560px]:py-1 max-[560px]:gap-2">
            <div className="grid grid-cols-3 gap-2 max-[560px]:gap-1.5">
                <div className="bg-[var(--color-bg)] border border-[var(--color-line)] rounded-[var(--radius-md)] px-[0.65rem] py-[0.55rem] max-[560px]:min-w-0 max-[560px]:px-2 max-[560px]:py-2">
                    <span className="block text-[var(--color-ink-muted)] text-[0.65rem] font-bold uppercase">Restaurant</span>
                    <strong className="block text-[var(--color-ink)] text-base mt-[0.15rem]">{restaurantMemberCount}</strong>
                </div>
                <div className="bg-[var(--color-bg)] border border-[var(--color-line)] rounded-[var(--radius-md)] px-[0.65rem] py-[0.55rem] max-[560px]:min-w-0 max-[560px]:px-2 max-[560px]:py-2">
                    <span className="block text-[var(--color-ink-muted)] text-[0.65rem] font-bold uppercase">Bar</span>
                    <strong className="block text-[var(--color-ink)] text-base mt-[0.15rem]">{barTeam.members.length}</strong>
                </div>
                <div className="bg-[var(--color-bg)] border border-[var(--color-line)] rounded-[var(--radius-md)] px-[0.65rem] py-[0.55rem] max-[560px]:min-w-0 max-[560px]:px-2 max-[560px]:py-2">
                    <span className="block text-[var(--color-ink-muted)] text-[0.65rem] font-bold uppercase">Runners</span>
                    <strong className="block text-[var(--color-ink)] text-base mt-[0.15rem]">{runners.length}</strong>
                </div>
            </div>

            {/* Restaurant Teams Controls */}
            <div className="flex justify-between items-center bg-[var(--color-bg)] px-3 py-[0.45rem] rounded-[var(--radius-md)] border border-[var(--color-line)] max-[560px]:py-2">
                <span className="text-[0.7rem] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.07em]">Restaurant Teams</span>
                <div className="flex items-center gap-1.5">
                    <button
                        className="bg-[var(--color-surface-muted)] border-0 text-[var(--color-ink)] w-[22px] h-[22px] rounded-[var(--radius-xs)] flex items-center justify-center cursor-pointer transition-opacity duration-150 text-base hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed max-[560px]:h-10 max-[560px]:w-10"
                        onClick={onRemoveTeam}
                        disabled={teams.length <= 1}
                        title="Remove last team"
                        aria-label="Remove last restaurant team"
                    >−</button>
                    <span className="font-bold text-[0.9rem] min-w-[18px] text-center">{teams.length}</span>
                    <button
                        className="bg-[var(--color-surface-muted)] border-0 text-[var(--color-ink)] w-[22px] h-[22px] rounded-[var(--radius-xs)] flex items-center justify-center cursor-pointer transition-opacity duration-150 text-base hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed max-[560px]:h-10 max-[560px]:w-10"
                        onClick={onAddTeam}
                        title="Add team"
                        aria-label="Add restaurant team"
                        disabled={teams.length >= 6}
                    >+</button>
                </div>
            </div>
            <p className="hidden max-[560px]:block m-0 text-[0.75rem] leading-5 text-[var(--color-ink-muted)]">
                Tap a team to add employees.
            </p>

            {/* All team cards in a 2-column card grid */}
            <div className="grid grid-cols-2 gap-2.5 items-start max-[900px]:grid-cols-1">
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
            if (prevT.members[j].isCaptainActive !== nextT.members[j].isCaptainActive) return false;
        }
    }

    // Check bar deeply
    for (let j = 0; j < prevProps.barTeam.members.length; j++) {
        const pm = prevProps.barTeam.members[j];
        const nm = nextProps.barTeam.members[j];
        if (pm.uid !== nm.uid || pm.points !== nm.points || pm.isCaptainActive !== nm.isCaptainActive) return false;
    }

    // Check runners deeply
    for (let j = 0; j < prevProps.runners.length; j++) {
        const pr = prevProps.runners[j];
        const nr = nextProps.runners[j];
        if (pr.uid !== nr.uid) return false;
        if (pr.payoutAmount !== nr.payoutAmount) return false;
        if (pr.fundingSourceMode !== nr.fundingSourceMode) return false;
        if (pr.sourceA !== nr.sourceA) return false;
        if (pr.sourceB !== nr.sourceB) return false;
        if (pr.amountFromSourceA !== nr.amountFromSourceA) return false;
        if (pr.percentFromSourceA !== nr.percentFromSourceA) return false;
    }

    return true; // Assume harmless properties haven't changed
});
