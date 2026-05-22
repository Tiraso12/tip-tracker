import React from 'react';

function AssignedEmployeeRow({ member, onDragStart, onRemove, isRunner }) {
    const pointsLabel = member.points === null || member.points === undefined || member.points === ""
        ? "Auto pts"
        : `${member.points} pts`;

    return (
        <div
            className="bg-[var(--color-surface-muted)] px-[0.45rem] py-[0.28rem] rounded-[var(--radius-xs)] flex items-center gap-[0.45rem] cursor-grab active:cursor-grabbing"
            draggable
            onDragStart={onDragStart}
        >
            <div className="text-[var(--color-ink-muted)] opacity-35 text-[0.8rem] leading-none">⋮⋮</div>
            <div className="flex-1 font-semibold text-[0.8rem] min-w-0">
                {member.name}
            </div>

            {isRunner ? (
                <span className="text-[var(--color-ink-muted)] text-[0.7rem] font-bold whitespace-nowrap bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-xs)] px-[0.4rem] py-[0.16rem]">Runner</span>
            ) : (
                <span className="text-[var(--color-ink-muted)] text-[0.7rem] font-bold whitespace-nowrap bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-xs)] px-[0.4rem] py-[0.16rem]">{pointsLabel}</span>
            )}

            <button
                className="bg-transparent border-0 text-[var(--color-ink-muted)] w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 text-[0.72rem] shrink-0 hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                onClick={onRemove}
            >✕</button>
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
