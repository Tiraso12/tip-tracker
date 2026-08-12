import React from 'react';
import { FLOOR_PLAN_ROLES, roleShortLabel } from '../../../utils/roleLabels';

function AssignedEmployeeRow({ member, onDragStart, onRemove, isRunner, canEditRole, onRoleChange }) {
    const pointsLabel = member.points === null || member.points === undefined || member.points === ""
        ? "Auto pts"
        : `${member.points} pts`;

    return (
        <div
            className="bg-[var(--color-surface-muted)] px-[0.45rem] py-[0.36rem] rounded-[var(--radius-xs)] grid grid-cols-[auto_minmax(0,1fr)] gap-x-[0.45rem] cursor-grab active:cursor-grabbing max-[560px]:px-2 max-[560px]:py-1.5 max-[560px]:grid-cols-[minmax(0,1fr)_auto] max-[560px]:items-center max-[560px]:gap-2"
            draggable
            onDragStart={onDragStart}
        >
            <div className="text-[var(--color-ink-muted)] opacity-35 text-[0.8rem] leading-none row-span-2 self-center max-[560px]:hidden">⋮⋮</div>

            <div className="min-w-0 flex flex-col gap-1 max-[560px]:gap-0">
                <div className="font-semibold text-[0.8rem] leading-tight truncate max-[560px]:text-[0.82rem]">
                    {member.name}
                </div>

                <div className="text-[0.66rem] font-bold uppercase tracking-[0.04em] text-[var(--color-ink-muted)] hidden max-[560px]:block">
                    {isRunner ? roleShortLabel("runner") : member.role === "bartender" ? roleShortLabel("bartender") : pointsLabel}
                </div>
            </div>

            <div className="flex items-center gap-1.5 min-w-0 pr-6 relative max-[560px]:pr-0 max-[560px]:gap-1">
                {isRunner ? (
                    <span className="text-[var(--color-ink-muted)] text-[0.7rem] font-bold whitespace-nowrap bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-xs)] px-[0.4rem] py-[0.16rem] max-[560px]:hidden">{roleShortLabel("runner")}</span>
                ) : canEditRole ? (
                    <select
                        value={FLOOR_PLAN_ROLES.includes(member.role) ? member.role : "server"}
                        onChange={(e) => onRoleChange(member.uid, e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 w-[88px] bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-xs)] px-1.5 text-[0.7rem] font-bold text-[var(--color-ink-soft)] cursor-pointer focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 max-[560px]:h-7 max-[560px]:w-[90px] max-[560px]:text-[0.72rem]"
                        aria-label={`${member.name} worked role`}
                    >
                        {FLOOR_PLAN_ROLES.map(role => (
                            <option key={role} value={role}>{roleShortLabel(role)}</option>
                        ))}
                    </select>
                ) : (
                    <span className="text-[var(--color-ink-muted)] text-[0.7rem] font-bold whitespace-nowrap bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-xs)] px-[0.4rem] py-[0.16rem] max-[560px]:hidden">
                        {member.role === "bartender" ? roleShortLabel("bartender") : pointsLabel}
                    </span>
                )}

                <button
                    className="absolute right-0 top-1/2 -translate-y-1/2 bg-transparent border-0 text-[var(--color-ink-muted)] w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 text-[0.72rem] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] max-[560px]:static max-[560px]:translate-y-0 max-[560px]:w-7 max-[560px]:h-7 max-[560px]:text-[0.8rem]"
                    onClick={onRemove}
                    aria-label={`Remove ${member.name}`}
                >✕</button>
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
