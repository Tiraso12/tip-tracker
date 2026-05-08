import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import styles from "./AdminDashboard.module.css";
import { db } from "../../config/firebase";
import { getCurrentWeek } from "../../utils/dateUtils";
import { generateMonthlyReport, generateWeeklyReport } from "../../utils/pdfExport";

function AdminReportsPanel() {
    const [viewMode, setViewMode] = useState("week");
    const [baseDateStr, setBaseDateStr] = useState(() => new Date().toISOString().split("T")[0]);
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);

    const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

    const { startStr, endStr, displayLabel, dateKeys } = React.useMemo(() => {
        const d = new Date(baseDateStr + "T12:00:00");
        let keys = [];
        let start, end, label;

        if (viewMode === "week") {
            const weekDates = getCurrentWeek(d);
            start = weekDates[0];
            end = weekDates[6];
            keys = weekDates.map(wd => wd.toISOString().split("T")[0]);
            label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        } else {
            const year = d.getFullYear();
            const month = d.getMonth();
            start = new Date(year, month, 1);
            end = new Date(year, month + 1, 0);

            const dayCount = end.getDate();
            for (let i = 1; i <= dayCount; i++) {
                const md = new Date(year, month, i);
                keys.push(md.toISOString().split("T")[0]);
            }
            label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        }

        return {
            startStr: start.toISOString().split("T")[0],
            endStr: end.toISOString().split("T")[0],
            displayLabel: label,
            dateKeys: keys
        };
    }, [baseDateStr, viewMode]);

    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);
            try {
                const q = query(collection(db, "shifts"), where("date", ">=", startStr), where("date", "<=", endStr));
                const snap = await getDocs(q);
                const shiftMap = {};

                snap.docs.forEach(d => {
                    shiftMap[d.id] = d.data();
                });

                const list = dateKeys.map(key => {
                    const sd = shiftMap[key];
                    let t = 0, g = 0, c = 0, rev = 0;
                    if (sd) {
                        rev = (sd.summary?.derivedValues?.totalTeamSales || sd.summary?.normalizedInputs?.teamSales || 0) + (sd.summary?.derivedValues?.barSales || 0);

                        if (sd.payouts) {
                            Object.values(sd.payouts).forEach(p => {
                                t += Number(p.tips) || 0;
                                g += Number(p.gratuity) || 0;
                                c += Number(p.cash) || 0;
                            });
                        }
                    }
                    return {
                        date: key, tip: t, gratuity: g, cash: c,
                        revenue: rev,
                        payouts: sd?.payouts || {}
                    };
                });
                setReportData(list);
            } catch (e) {
                console.error("Failed to load reports:", e);
            }
            setLoading(false);
        };
        fetchReport();
    }, [startStr, endStr, dateKeys]);

    const handleExport = () => {
        if (viewMode === 'month') {
            generateMonthlyReport(displayLabel, reportData);
        } else {
            generateWeeklyReport(reportData, displayLabel);
        }
    };

    const totals = reportData.reduce((acc, d) => ({
        tips: acc.tips + d.tip,
        gratuity: acc.gratuity + d.gratuity,
        cash: acc.cash + d.cash,
        revenue: acc.revenue + d.revenue,
        total: acc.total + d.tip + d.gratuity + d.cash
    }), { tips: 0, gratuity: 0, cash: 0, revenue: 0, total: 0 });

    const changePeriod = (delta) => {
        const d = new Date(baseDateStr + "T12:00:00");
        if (viewMode === 'week') {
            d.setDate(d.getDate() + (delta * 7));
        } else {
            d.setMonth(d.getMonth() + delta);
        }
        setBaseDateStr(d.toISOString().split("T")[0]);
    };

    return (
        <div className={styles.payoutPanel}>
            <div className={styles.payoutPanelHeader}>
                <h3 className={styles.payoutPanelTitle}>Financial Reports</h3>
                {reportData.length > 0 && (
                    <button className={styles.exportBtn} onClick={handleExport} disabled={loading}>
                        {loading ? "Loading..." : "Export PDF"}
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
                <select value={viewMode} onChange={e => setViewMode(e.target.value)} className={styles.dateInput} style={{ cursor: 'pointer', padding: '0.4rem 0.8rem' }}>
                    <option value="week">Weekly Report</option>
                    <option value="month">Monthly Report</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className={styles.dayNavBtn} onClick={() => changePeriod(-1)} title="Previous">←</button>
                    <input
                        type="date"
                        value={baseDateStr}
                        onChange={e => setBaseDateStr(e.target.value)}
                        className={styles.dateInput}
                    />
                    <button className={styles.dayNavBtn} onClick={() => changePeriod(1)} title="Next">→</button>
                </div>
            </div>

            <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{displayLabel}</h4>
                </div>

                <div className={styles.totalSummary} style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <span>Rev: <strong>{fmt(totals.revenue)}</strong></span>
                    <span>Tips: <strong>{fmt(totals.tips)}</strong></span>
                    <span>Grat: <strong>{fmt(totals.gratuity)}</strong></span>
                    <span>Cash: <strong>{fmt(totals.cash)}</strong></span>
                    <span style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                        Period Pool: <strong style={{ color: 'var(--primary)' }}>{fmt(totals.total)}</strong>
                    </span>
                </div>

                {loading ? (
                    <div className={styles.payoutEmpty}>Loading shift data...</div>
                ) : (
                    <div className={styles.payoutTableWrap}>
                        <table className={styles.dayPayoutTable}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Rev</th>
                                    <th>Tips</th>
                                    <th>Gratuity</th>
                                    <th>Cash</th>
                                    <th>Daily Pool</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.map(d => {
                                    const dailyTotal = d.tip + d.gratuity + d.cash;
                                    const noData = dailyTotal === 0 && Object.keys(d.payouts).length === 0;
                                    return (
                                        <tr key={d.date} className={styles.payoutRow} style={{ opacity: noData ? 0.5 : 1 }}>
                                            <td style={{ fontWeight: 500 }}>{new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
                                            <td>{fmt(d.revenue)}</td>
                                            <td>{fmt(d.tip)}</td>
                                            <td>{fmt(d.gratuity)}</td>
                                            <td>{fmt(d.cash)}</td>
                                            <td className={styles.totalCell}>{fmt(dailyTotal)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminReportsPanel;
