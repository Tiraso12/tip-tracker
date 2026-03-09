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
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="number"
                        placeholder="Payout $"
                        className={`${styles.runnerInput} ${styles.noSpinners}`}
                        style={{ width: '60px', borderRadius: '4px' }}
                        value={member.payoutAmount || ''}
                        onChange={(e) => onUpdateField('payoutAmount', e.target.value)}
                    />

                    <select
                        className={styles.runnerSelect}
                        style={{ width: 'auto', borderRadius: '4px' }}
                        value={member.fundingSourceMode || 'single_source'}
                        onChange={(e) => onUpdateField('fundingSourceMode', e.target.value)}
                    >
                        <option value="single_source">S/S</option>
                        <option value="amount_plus_remainder">Fixed</option>
                        <option value="percent_plus_remainder">% Split</option>
                    </select>

                    <select
                        className={styles.runnerSelect}
                        style={{ width: 'auto', borderRadius: '4px' }}
                        value={member.sourceA || 'Even Split'}
                        onChange={(e) => onUpdateField('sourceA', e.target.value)}
                    >
                        <option value="Even Split">Even Split</option>
                        <option value="Team 1 CTP">Team 1 CTP</option>
                        <option value="Team 2 CTP">Team 2 CTP</option>
                        <option value="Team 3 CTP">Team 3 CTP</option>
                        <option value="Team 4 CTP">Team 4 CTP</option>
                        <option value="Team 5 CTP">Team 5 CTP</option>
                        <option value="Bar CTP">Bar CTP</option>
                    </select>

                    {member.fundingSourceMode === 'amount_plus_remainder' && (
                        <input
                            type="number"
                            placeholder="$ Src A"
                            className={`${styles.runnerInput} ${styles.noSpinners}`}
                            style={{ width: '60px', borderRadius: '4px' }}
                            value={member.amountFromSourceA || ''}
                            onChange={(e) => onUpdateField('amountFromSourceA', e.target.value)}
                        />
                    )}

                    {member.fundingSourceMode === 'percent_plus_remainder' && (
                        <input
                            type="number"
                            placeholder="% Src A"
                            className={`${styles.runnerInput} ${styles.noSpinners}`}
                            style={{ width: '60px', borderRadius: '4px' }}
                            value={member.percentFromSourceA || ''}
                            onChange={(e) => onUpdateField('percentFromSourceA', e.target.value)}
                        />
                    )}

                    {(member.fundingSourceMode === 'amount_plus_remainder' || member.fundingSourceMode === 'percent_plus_remainder') && (
                        <select
                            className={styles.runnerSelect}
                            style={{ width: 'auto', borderRadius: '4px' }}
                            value={member.sourceB || ''}
                            onChange={(e) => onUpdateField('sourceB', e.target.value)}
                        >
                            <option value="">-- Remainder Pool --</option>
                            <option value="Team 1 CTP">Team 1 CTP</option>
                            <option value="Team 2 CTP">Team 2 CTP</option>
                            <option value="Team 3 CTP">Team 3 CTP</option>
                            <option value="Team 4 CTP">Team 4 CTP</option>
                            <option value="Team 5 CTP">Team 5 CTP</option>
                            <option value="Bar CTP">Bar CTP</option>
                        </select>
                    )}
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
