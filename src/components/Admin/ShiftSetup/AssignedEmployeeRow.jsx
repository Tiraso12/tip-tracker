import React from 'react';
import styles from './ShiftSetup.module.css';

function AssignedEmployeeRow({ member, onDragStart, onRemove, onUpdateField, isRunner }) {
    return (
        <div
            className={styles.assignedRow}
            draggable
            onDragStart={onDragStart}
        >
            <div className={styles.rowHandle}>⋮⋮</div>
            <div className={styles.rowName}>
                {member.name}
            </div>

            {isRunner ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Payout:</div>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>$</span>
                        <input
                            type="number"
                            placeholder="102"
                            className={`${styles.runnerInput} ${styles.noSpinners}`}
                            style={{ width: '75px', borderRadius: '4px', paddingLeft: '1.2rem' }}
                            value={member.payoutAmount || ''}
                            onChange={(e) => onUpdateField('payoutAmount', e.target.value)}
                        />
                    </div>
                </div>
            ) : (
                <div className={styles.pointsControl}>
                    <button
                        className={styles.ptsBtn}
                        onClick={() => onUpdateField('points', Math.max(0, (Number(member.points) || 0) - 0.5))}
                    >−</button>
                    <span className={styles.ptsValue}>{member.points}</span>
                    <button
                        className={styles.ptsBtn}
                        onClick={() => onUpdateField('points', (Number(member.points) || 0) + 0.5)}
                    >+</button>
                </div>
            )}

            <button className={styles.removeBtn} onClick={onRemove}>✕</button>
        </div>
    );
}

export default React.memo(AssignedEmployeeRow, (prevProps, nextProps) => {
    return prevProps.member.points === nextProps.member.points &&
        prevProps.member.isCaptainActive === nextProps.member.isCaptainActive &&
        prevProps.member.payoutAmount === nextProps.member.payoutAmount &&
        prevProps.member.fundingSourceMode === nextProps.member.fundingSourceMode &&
        prevProps.member.sourceA === nextProps.member.sourceA &&
        prevProps.member.sourceB === nextProps.member.sourceB &&
        prevProps.member.amountFromSourceA === nextProps.member.amountFromSourceA &&
        prevProps.member.percentFromSourceA === nextProps.member.percentFromSourceA &&
        prevProps.member.uid === nextProps.member.uid &&
        prevProps.isRunner === nextProps.isRunner;
});
