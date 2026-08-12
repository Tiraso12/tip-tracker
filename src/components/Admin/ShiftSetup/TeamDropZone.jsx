import React from 'react';
import AssignedEmployeeRow from './AssignedEmployeeRow';
import { ROLE_POINTS } from '../../../utils/constants';
import { roleInitial } from '../../../utils/roleLabels';

// Compact role tag for a mobile roster chip. One visual family: dining carries a
// role letter + points ("C·4"); bar/runners have no points, so they read as a
// compact role label of the same size ("BAR", "RUN") - never a faked "·0".
const memberTag = (member) => {
    const badge = roleInitial(member.role);
    const points = ROLE_POINTS[member.role];
    return points != null ? `${badge}·${points}` : badge;
};

// Mobile roster preview. The card answers "who" and now also "as what": each chip
// carries a compact role/points tag (e.g. "C·4"), and the captain gets a distinct
// accent so the team lead is scannable at a glance. Per captain, the initials
// avatar is gone - name + role + points is enough and frees horizontal space.
// Long rosters cap with a "+N more" chip; long names truncate before the tag.
function MemberChips({ members }) {
    const shown = members.slice(0, 6);
    const overflow = members.length - shown.length;

    return (
        <div className="hidden max-[560px]:flex flex-wrap items-center gap-1.5 pt-0.5">
            {shown.map(member => {
                const isCaptain = member.role === 'captain';
                return (
                    <span
                        key={member.uid}
                        className={[
                            "inline-flex max-w-full items-center gap-1.5 rounded-full border pl-2 pr-1 py-0.5",
                            isCaptain
                                ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)]"
                                : "border-[var(--color-line)] bg-[var(--color-surface-muted)]",
                        ].join(" ")}
                    >
                        <span className={[
                            "max-w-[7rem] truncate text-[0.72rem] font-medium leading-none",
                            isCaptain ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]",
                        ].join(" ")}>
                            {member.name}
                        </span>
                        <span className={[
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold uppercase leading-none tracking-[0.02em]",
                            isCaptain
                                ? "bg-[var(--color-accent)] text-[var(--color-surface)]"
                                : "bg-[var(--color-surface)] text-[var(--color-ink-muted)]",
                        ].join(" ")}>
                            {memberTag(member)}
                        </span>
                    </span>
                );
            })}
            {overflow > 0 ? (
                <span className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[0.7rem] font-semibold text-[var(--color-ink-muted)]">
                    +{overflow} more
                </span>
            ) : null}
        </div>
    );
}

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
    onRoleChange,
    hideMembers = false,
    isMobile = false,
    readOnly = false
}) {
    const canEditRole = !isRunner && teamId !== 'bar';
    const isPopulated = members.length > 0;
    const interactive = !readOnly;
    // On phones the whole card is the tap target (>=44px, role=button) - the header
    // strip was a sub-minimum 32px target while the largest, most obvious Fitts area
    // sat dead. On desktop the header button stays the control so the assigned rows
    // below keep their own drag/role/remove affordances.
    const cardIsButton = isMobile && interactive;
    // Dashed border is reserved for empty / drop-target states; a populated team
    // gets a solid border so it no longer reads as an empty "drop here" placeholder.
    const zoneClass = [
        "border-[1.5px] rounded-[var(--radius-md)] px-[0.65rem] py-[0.55rem] min-h-[62px] flex flex-col gap-[0.35rem] transition-all duration-200 max-[560px]:min-h-[44px] max-[560px]:px-3 max-[560px]:py-2 max-[560px]:rounded-[var(--radius-sm)]",
        cardIsButton ? "max-[560px]:cursor-pointer" : "",
        isSelected
                ? "bg-[var(--color-accent-soft)] border-solid border-[var(--color-accent)] shadow-[0_0_0_2px_var(--color-accent-soft)]"
            : isOver
                ? "bg-[var(--color-accent-soft)] border-dashed border-[var(--color-accent)]"
            : isPopulated
                ? "bg-[var(--color-surface)] border-solid border-[var(--color-line-strong)]"
                : "bg-[var(--color-surface)] border-dashed border-[var(--color-line)]",
    ].join(" ");

    const handleActivate = () => { if (interactive) onTeamClick(teamId); };

    const cardButtonProps = cardIsButton ? {
        role: "button",
        tabIndex: 0,
        "aria-pressed": isSelected,
        onClick: handleActivate,
        onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); }
        },
    } : {};

    // Title: calm sentence-case on phones (the Day Rail voice); the shouty
    // letter-spaced all-caps stays only on the wider desktop layout.
    const titleEl = (
        <h4 className="text-[0.72rem] font-bold text-[var(--color-ink-muted)] m-0 uppercase tracking-[0.05em] max-[560px]:min-w-0 max-[560px]:truncate max-[560px]:normal-case max-[560px]:tracking-normal max-[560px]:text-[0.82rem] max-[560px]:text-[var(--color-ink)]">
            {isSelected && <span className="text-[var(--color-accent)] text-[0.5rem] mr-[0.35rem] align-middle animate-pulse max-[560px]:hidden">●</span>}
            {title}
        </h4>
    );
    const countEl = (
        <span className={
            "text-[0.67rem] opacity-70 max-[560px]:shrink-0 max-[560px]:text-[0.78rem] max-[560px]:font-semibold max-[560px]:opacity-100 " +
            (members.length === 0 ? "max-[560px]:text-[var(--color-accent)] text-[var(--color-ink-muted)]" : "text-[var(--color-ink-muted)]")
        }>
            {members.length === 0
                ? (interactive ? '+ Add' : 'Empty')
                : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
        </span>
    );

    return (
        <div
            className={zoneClass}
            onDragOver={(e) => interactive && onDragOver(e, teamId)}
            onDragLeave={interactive ? onDragLeave : undefined}
            onDrop={(e) => interactive && onDrop(e, teamId)}
            {...cardButtonProps}
        >
            {cardIsButton ? (
                <div className="w-full flex justify-between items-center gap-2 min-h-[36px] max-[560px]:mb-0">
                    {titleEl}
                    {countEl}
                </div>
            ) : (
                <button
                    type="button"
                    className="w-full flex justify-between items-center mb-1 cursor-pointer rounded-[4px] px-1 py-0.5 -mx-1 -my-0.5 transition-colors duration-150 hover:bg-[var(--color-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 max-[560px]:min-h-8 max-[560px]:mb-0 disabled:cursor-default disabled:hover:bg-transparent"
                    onClick={handleActivate}
                    disabled={!interactive}
                    aria-pressed={isSelected}
                    title={!interactive ? undefined : isSelected ? 'Click to deselect' : 'Click to select this team, then click employees to assign'}
                >
                    {titleEl}
                    {countEl}
                </button>
            )}

            {members.length === 0 ? (
                // Desktop keeps its centered helper line. On phones the empty card shows
                // no in-card box (B5): the top-right "+ Add" cue is enough, and the whole
                // card stays the tap target that opens the add/assign flow. Dropping the
                // dashed "+ Add employees" box reclaims vertical space in the 2-up grid.
                <div className="text-[var(--color-ink-muted)] text-[0.75rem] text-center py-2 pointer-events-none opacity-60 max-[560px]:hidden">
                    {readOnly ? 'No one assigned' : isSelected ? 'Tap employees below to add' : 'Tap to select this team'}
                </div>
            ) : (
                <>
                    <div className={(hideMembers ? "hidden" : "contents max-[560px]:hidden")}>
                        {members.map(member => (
                            <AssignedEmployeeRow
                                key={member.uid}
                                member={member}
                                isRunner={isRunner}
                                canEditRole={canEditRole}
                                onDragStart={(e) => onDragStart(e, member.uid, teamId)}
                                onRemove={() => onRemove(member.uid, teamId)}
                                onRoleChange={(uid, role) => onRoleChange(teamId, uid, role)}
                            />
                        ))}
                    </div>
                    {hideMembers ? null : <MemberChips members={members} />}
                </>
            )}
        </div>
    );
}

export default React.memo(TeamDropZone, (prevProps, nextProps) => {
    // Re-render if selection or hover state changes
    if (prevProps.isOver !== nextProps.isOver) return false;
    if (prevProps.isSelected !== nextProps.isSelected) return false;
    if (prevProps.hideMembers !== nextProps.hideMembers) return false;
    if (prevProps.isMobile !== nextProps.isMobile) return false;
    if (prevProps.readOnly !== nextProps.readOnly) return false;
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
