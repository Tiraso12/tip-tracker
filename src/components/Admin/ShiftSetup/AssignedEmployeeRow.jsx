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
                        className={styles.ptsBtn}
                        style={{ width: '60px', borderRadius: '4px' }}
                        value={member.payoutAmount || ''}
                        onChange={(e) => onUpdateField('payoutAmount', e.target.value)}
                    />

                    <select
                        className={styles.ptsBtn}
                        style={{ width: 'auto', borderRadius: '4px' }}
                        value={member.fundingSourceMode || 'single_source'}
                        onChange={(e) => onUpdateField('fundingSourceMode', e.target.value)}
                    >
                        <option value="single_source">Single Source</option>
                        <option value="amount_plus_remainder">Fixed $ + Remainder</option>
                        <option value="percent_plus_remainder">Percent % + Remainder</option>
                    </select>

                    <select
                        className={styles.ptsBtn}
                        style={{ width: 'auto', borderRadius: '4px' }}
                        value={member.sourceA || ''}
                        onChange={(e) => onUpdateField('sourceA', e.target.value)}
                    >
                        <option value="">-- Main Pool --</option>
                        <option value="Team CTP">Team CTP</option>
                        <option value="Bar CTP">Bar CTP</option>
                        <option value="Team/Bar 50/50">Team & Bar (50/50)</option>
                    </select>

                    {member.fundingSourceMode === 'amount_plus_remainder' && (
                        <input
                            type="number"
                            placeholder="$ Src A"
                            className={styles.ptsBtn}
                            style={{ width: '60px', borderRadius: '4px' }}
                            value={member.amountFromSourceA || ''}
                            onChange={(e) => onUpdateField('amountFromSourceA', e.target.value)}
                        />
                    )}

                    {member.fundingSourceMode === 'percent_plus_remainder' && (
                        <input
                            type="number"
                            placeholder="% Src A"
                            className={styles.ptsBtn}
                            style={{ width: '60px', borderRadius: '4px' }}
                            value={member.percentFromSourceA || ''}
                            onChange={(e) => onUpdateField('percentFromSourceA', e.target.value)}
                        />
                    )}

                    {(member.fundingSourceMode === 'amount_plus_remainder' || member.fundingSourceMode === 'percent_plus_remainder') && (
                        <select
                            className={styles.ptsBtn}
                            style={{ width: 'auto', borderRadius: '4px' }}
                            value={member.sourceB || ''}
                            onChange={(e) => onUpdateField('sourceB', e.target.value)}
                        >
                            <option value="">-- Remainder --</option>
                            <option value="Team CTP">Team CTP</option>
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
