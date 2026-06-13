import React from 'react';
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
    onRemove,
    onRoleChange
}) {
    const canEditRole = !isRunner && teamId !== 'bar';
    const zoneClass = [
        "border-[1.5px] rounded-[var(--radius-md)] px-[0.65rem] py-[0.55rem] min-h-[62px] flex flex-col gap-[0.35rem] transition-all duration-200 max-[560px]:min-h-0 max-[560px]:px-3 max-[560px]:py-2",
        isSelected
            ? "bg-[var(--color-surface)] border-solid border-[var(--color-accent)] shadow-[0_0_0_2px_var(--color-accent-soft)]"
            : isOver
                ? "bg-[var(--color-accent-soft)] border-dashed border-[var(--color-accent)]"
                : "bg-[var(--color-surface)] border-dashed border-[var(--color-line)]",
    ].join(" ");

    return (
        <div
            className={zoneClass}
            onDragOver={(e) => onDragOver(e, teamId)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, teamId)}
        >
            <button
                type="button"
                className="w-full flex justify-between items-center mb-1 cursor-pointer rounded-[4px] px-1 py-0.5 -mx-1 -my-0.5 transition-colors duration-150 hover:bg-[var(--color-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 max-[560px]:min-h-9 max-[560px]:mb-0"
                onClick={() => onTeamClick(teamId)}
                aria-pressed={isSelected}
                title={isSelected ? 'Click to deselect' : 'Click to select this team, then click employees to assign'}
            >
                <h4 className="text-[0.72rem] font-bold text-[var(--color-ink-muted)] m-0 uppercase tracking-[0.05em]">
                    {isSelected && <span className="text-[var(--color-accent)] text-[0.5rem] mr-[0.35rem] align-middle animate-pulse">●</span>}
                    {title}
                </h4>
                <span className="text-[0.67rem] text-[var(--color-ink-muted)] opacity-70 max-[560px]:text-[0.7rem]">
                    {members.length === 0 ? 'Add' : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
                </span>
            </button>

            {members.length === 0 ? (
                <div className="text-[var(--color-ink-muted)] text-[0.75rem] text-center py-2 pointer-events-none opacity-60 max-[560px]:hidden">
                    {isSelected ? 'Tap employees below to add' : 'Tap to select this team'}
                </div>
            ) : (
                members.map(member => (
                    <AssignedEmployeeRow
                        key={member.uid}
                        member={member}
                        isRunner={isRunner}
                        canEditRole={canEditRole}
                        onDragStart={(e) => onDragStart(e, member.uid, teamId)}
                        onRemove={() => onRemove(member.uid, teamId)}
                        onRoleChange={(uid, role) => onRoleChange(teamId, uid, role)}
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
        if (prevProps.members[i].role !== nextProps.members[i].role) return false;
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
