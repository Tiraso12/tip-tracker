import React from 'react';

const RESTAURANT_ROLE_OPTIONS = [
    { value: "captain", label: "Captain" },
    { value: "server", label: "Server" },
    { value: "back", label: "Back" },
    { value: "assistant", label: "Assistant" },
];

function AssignedEmployeeRow({ member, onDragStart, onRemove, isRunner, canEditRole, onRoleChange }) {
    const pointsLabel = member.points === null || member.points === undefined || member.points === ""
        ? "Auto pts"
        : `${member.points} pts`;

    return (
        <div
            className="bg-[var(--color-surface-muted)] px-[0.45rem] py-[0.36rem] rounded-[var(--radius-xs)] grid grid-cols-[auto_minmax(0,1fr)] gap-x-[0.45rem] gap-y-1 cursor-grab active:cursor-grabbing"
            draggable
            onDragStart={onDragStart}
        >
            <div className="text-[var(--color-ink-muted)] opacity-35 text-[0.8rem] leading-none row-span-2 self-center">⋮⋮</div>

            <div className="min-w-0 flex flex-col gap-1">
                <div className="font-semibold text-[0.8rem] leading-tight truncate">
                    {member.name}
                </div>

                <div className="flex items-center gap-1.5 min-w-0 pr-6 relative">
                    {isRunner ? (
                        <span className="text-[var(--color-ink-muted)] text-[0.7rem] font-bold whitespace-nowrap bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-xs)] px-[0.4rem] py-[0.16rem]">Runner</span>
                    ) : canEditRole ? (
                        <>
                            <select
                                value={RESTAURANT_ROLE_OPTIONS.some(option => option.value === member.role) ? member.role : "server"}
                                onChange={(e) => onRoleChange(member.uid, e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="h-6 w-[88px] bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-xs)] px-1.5 text-[0.7rem] font-bold text-[var(--color-ink-soft)] cursor-pointer focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15"
                                aria-label={`${member.name} worked role`}
                            >
                                {RESTAURANT_ROLE_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </>
                    ) : (
                        <span className="text-[var(--color-ink-muted)] text-[0.7rem] font-bold whitespace-nowrap bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-xs)] px-[0.4rem] py-[0.16rem]">
                            {member.role === "bartender" ? "Bar" : pointsLabel}
                        </span>
                    )}

                    <button
                        className="absolute right-0 top-1/2 -translate-y-1/2 bg-transparent border-0 text-[var(--color-ink-muted)] w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 text-[0.72rem] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                        onClick={onRemove}
                    >✕</button>
                </div>
            </div>
        </div>
    );
}

export default React.memo(AssignedEmployeeRow, (prevProps, nextProps) => {
    return prevProps.member.points === nextProps.member.points &&
        prevProps.member.role === nextProps.member.role &&
        prevProps.member.isCaptainActive === nextProps.member.isCaptainActive &&
        prevProps.member.payoutAmount === nextProps.member.payoutAmount &&
        prevProps.member.uid === nextProps.member.uid &&
        prevProps.isRunner === nextProps.isRunner &&
        prevProps.canEditRole === nextProps.canEditRole;
});
