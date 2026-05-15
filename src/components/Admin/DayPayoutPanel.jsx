import React from "react";
import styles from "./AdminDashboard.module.css";
import { generateShiftReport } from "../../utils/pdfExport";

function DayPayoutPanel({ date, summary, loading }) {
    const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

    const displayDate = (() => {
        const [y, m, d] = date.split("-");
        return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
            weekday: "long", year: "numeric", month: "long", day: "numeric"
        });
    })();

    return (
        <div className={styles.payoutPanel}>
            <div className={styles.payoutPanelHeader}>
                <h3 className={styles.payoutPanelTitle}>{displayDate}</h3>
                {summary && (
                    <button
                        className={styles.exportBtn}
                        onClick={() => generateShiftReport(date, summary)}
                    >
                        Export PDF
                    </button>
                )}
            </div>

            {loading ? (
                <div className={styles.payoutEmpty}>Loading...</div>
            ) : !summary ? (
                <div className={styles.payoutEmpty}>
                    <span className={styles.payoutEmptyIcon}>📋</span>
                    <p>No shift saved for this date.</p>
                    <p className={styles.payoutEmptyHint}>Open the shift editor to input and calculate payouts.</p>
                </div>
            ) : (
                <>
                    <div className={styles.daySummaryBar} style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>INPUTS</div>
                                <div style={{ fontWeight: 600 }}>Team Sales: {fmt(summary.derivedValues?.totalTeamSales)}</div>
                                <div>Contract Grat: {fmt(summary.derivedValues?.grtContractTotal)}</div>
                                <div>DCTP ({fmt(summary.derivedValues?.baseTeamCTP)}) + BCTP ({fmt(summary.derivedValues?.barCTP)}): {fmt(summary.derivedValues?.ctpTotal)}</div>
                                <div>Cash Total: {fmt(summary.derivedValues?.baseTeamCash)}</div>
                                <div>Grat total: {fmt(summary.derivedValues?.grtTotal)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>ALLOCATIONS (HOUSE & BAR)</div>
                                <div>Door: {fmt((summary.allocations?.doorCTPAllocation || 0) + (summary.allocations?.doorGRTAllocation || 0))}</div>
                                <div>Bar Cut: {fmt((summary.allocations?.barCTPAllocation || 0) + (summary.allocations?.barGRTAllocation || 0))}</div>
                                <div>House: {fmt(summary.allocations?.houseAllocation || 0)}</div>
                                <div>Coordinator: {fmt(summary.allocations?.peCoordinatorGRT || 0)}</div>
                                <div>Runners Fee: {fmt(summary.allocations?.totalRunnerPay || 0)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>BALANCES</div>
                                <div style={{ fontWeight: 600, color: summary.balances?.overallBalance === 0 ? 'var(--success)' : 'var(--danger)' }}>
                                    Overall Balance: {fmt(summary.balances?.overallBalance)}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Available CTP ({fmt(summary.derivedValues?.ctpTotal)}) + GRT ({fmt(summary.derivedValues?.grtTotal)}): {fmt((summary.balances?.totalAvailable || 0) - (summary.derivedValues?.baseTeamCash || 0))}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Distributed CTP + GRT: {fmt((summary.balances?.totalDistributed || 0) - (summary.derivedValues?.baseTeamCash || 0))}</div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.4rem' }}>
                                    Total Team Points: {summary.pointTotals?.totalAllTeamPoints || 0}
                                </div>
                            </div>
                        </div>
                    </div>

                    {summary.validations && summary.validations.length > 0 && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--danger)' }}>Warnings</h4>
                            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                                {summary.validations.map((v, i) => <li key={i}>{v}</li>)}
                            </ul>
                        </div>
                    )}

                    <div className={styles.payoutTableWrap} style={{ background: 'var(--bg-card)', borderRadius: '8px', overflow: 'hidden' }}>
                        <table className={styles.dayPayoutTable}>
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>{summary.payouts?.roleGrouped ? 'Team Worked' : 'Role'}</th>
                                    <th>Points</th>
                                    <th>CTP</th>
                                    <th>GRT</th>
                                    <th>Cash</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.payouts?.roleGrouped && (() => {
                                    const renderGroup = (label, arr, isRunner = false) => {
                                        if (!arr || arr.length === 0) return null;
                                        return (
                                            <React.Fragment key={label}>
                                                <tr className={styles.roleHeaderRow}><td colSpan={7}><span className={styles.roleHeaderLabel}>{label}</span></td></tr>
                                                {arr.map(p => (
                                                    <tr key={p.uid} className={styles.payoutRow}>
                                                        <td className={styles.nameCell}>{p.name}</td>
                                                        <td>{isRunner ? "Runner" : (p.teamId ? p.teamId.replace('team-', 'Team ') : "Bar")}</td>
                                                        {isRunner ? (
                                                            <td colSpan={4} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                {Object.entries(p.breakdown || {}).map(([src, val]) => `${src}: ${fmt(val)}`).join(' | ')}
                                                            </td>
                                                        ) : (
                                                            <>
                                                                <td className={styles.roleCell}>{p.points}</td>
                                                                <td>{fmt(p.ctp)}</td>
                                                                <td>{fmt(p.grt)}</td>
                                                                <td>{fmt(p.cash)}</td>
                                                            </>
                                                        )}
                                                        <td className={styles.totalCell}>{fmt(isRunner ? p.payoutAmount : p.total)}</td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    };

                                    return (
                                        <>
                                            {renderGroup("Captains", summary.payouts.roleGrouped.captains)}
                                            {renderGroup("Servers", summary.payouts.roleGrouped.servers)}
                                            {renderGroup("Backs", summary.payouts.roleGrouped.backs)}
                                            {renderGroup("Assistants", summary.payouts.roleGrouped.assistants)}
                                            {renderGroup("Bar Team", summary.payouts.roleGrouped.bar)}
                                            {renderGroup("Runners", summary.payouts.roleGrouped.runners, true)}
                                        </>
                                    );
                                })()}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

export default DayPayoutPanel;
