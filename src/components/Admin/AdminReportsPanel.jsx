import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import styles from "./AdminDashboard.module.css";
import { db } from "../../config/firebase";
import { getBiweeklyPeriod, getCurrentWeek } from "../../utils/dateUtils";
import { generateMonthlyReport, generateWeeklyReport } from "../../utils/pdfExport";

const ROLE_ORDER = ["captain", "server", "back", "assistant", "bartender", "runner"];
const ROLE_LABELS = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bartender",
    runner: "Runner",
};

const toMoney = (value) => Number(value) || 0;

function getShiftRevenue(shiftData) {
    if (!shiftData) return 0;
    return toMoney(shiftData.summary?.derivedValues?.totalTeamSales)
        + toMoney(shiftData.summary?.derivedValues?.barSales);
}

function buildEmployeeTotals(reportData) {
    const employeeMap = {};

    reportData.forEach((day) => {
        Object.entries(day.payouts || {}).forEach(([uid, payout]) => {
            if (!employeeMap[uid]) {
                employeeMap[uid] = {
                    uid,
                    name: payout.name || "Unknown",
                    role: payout.role || "staff",
                    shifts: 0,
                    tips: 0,
                    gratuity: 0,
                    cash: 0,
                    total: 0,
                };
            }

            const tips = toMoney(payout.tips);
            const gratuity = toMoney(payout.gratuity);
            const cash = toMoney(payout.cash);
            const total = payout.total !== undefined ? toMoney(payout.total) : tips + gratuity + cash;

            employeeMap[uid].tips += tips;
            employeeMap[uid].gratuity += gratuity;
            employeeMap[uid].cash += cash;
            employeeMap[uid].total += total;
            employeeMap[uid].shifts += total > 0 ? 1 : 0;
        });
    });

    return Object.values(employeeMap).sort((a, b) => {
        const aRoleRank = ROLE_ORDER.includes(a.role) ? ROLE_ORDER.indexOf(a.role) : ROLE_ORDER.length;
        const bRoleRank = ROLE_ORDER.includes(b.role) ? ROLE_ORDER.indexOf(b.role) : ROLE_ORDER.length;
        const roleDiff = aRoleRank - bRoleRank;
        if (roleDiff !== 0) return roleDiff;
        if (b.total !== a.total) return b.total - a.total;
        return a.name.localeCompare(b.name);
    });
}

function AdminReportsPanel() {
    const [viewMode, setViewMode] = useState("week");
    const [baseDateStr, setBaseDateStr] = useState(() => new Date().toISOString().split("T")[0]);
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);

    const fmt = (n) => `$${toMoney(n).toFixed(2)}`;

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
        } else if (viewMode === "period") {
            const period = getBiweeklyPeriod(d);
            start = period.start;
            end = period.end;

            const cursor = new Date(start);
            while (cursor <= end) {
                keys.push(cursor.toISOString().split("T")[0]);
                cursor.setDate(cursor.getDate() + 1);
            }

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
                        rev = getShiftRevenue(sd);

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
            generateWeeklyReport(reportData, displayLabel, viewMode === "period" ? "Pay Period" : "Weekly");
        }
    };

    const totals = reportData.reduce((acc, d) => ({
        tips: acc.tips + d.tip,
        gratuity: acc.gratuity + d.gratuity,
        cash: acc.cash + d.cash,
        revenue: acc.revenue + d.revenue,
        total: acc.total + d.tip + d.gratuity + d.cash
    }), { tips: 0, gratuity: 0, cash: 0, revenue: 0, total: 0 });

    const employeeTotals = React.useMemo(() => buildEmployeeTotals(reportData), [reportData]);
    const workedDays = reportData.filter(d => Object.keys(d.payouts).length > 0).length;

    const changePeriod = (delta) => {
        const d = new Date(baseDateStr + "T12:00:00");
        if (viewMode === 'week') {
            d.setDate(d.getDate() + (delta * 7));
        } else if (viewMode === 'period') {
            d.setDate(d.getDate() + (delta * 14));
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

            <div className={styles.reportControls}>
                <select value={viewMode} onChange={e => setViewMode(e.target.value)} className={`${styles.dateInput} ${styles.reportSelect}`}>
                    <option value="week">Weekly Report</option>
                    <option value="period">Pay Period Report</option>
                    <option value="month">Monthly Report</option>
                </select>
                <div className={styles.reportDateControls}>
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

            <div className={styles.reportBody}>
                <div className={styles.reportHeaderRow}>
                    <div>
                        <h4 className={styles.reportPeriodTitle}>{displayLabel}</h4>
                        <p className={styles.reportPeriodMeta}>
                            {workedDays} worked {workedDays === 1 ? "day" : "days"} / {employeeTotals.length} employees paid
                        </p>
                    </div>
                </div>

                <div className={styles.reportSummaryGrid}>
                    <span>Revenue <strong>{fmt(totals.revenue)}</strong></span>
                    <span>Tips <strong>{fmt(totals.tips)}</strong></span>
                    <span>Gratuity <strong>{fmt(totals.gratuity)}</strong></span>
                    <span>Cash <strong>{fmt(totals.cash)}</strong></span>
                    <span className={styles.reportSummaryTotal}>
                        Period Pool <strong>{fmt(totals.total)}</strong>
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
                                        <tr key={d.date} className={`${styles.payoutRow} ${noData ? styles.reportEmptyDayRow : ""}`}>
                                            <td className={styles.reportDateCell}>{new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
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

                {!loading && (
                    <div className={styles.reportSection}>
                        <div className={styles.reportSectionHeader}>
                            <h4 className={styles.reportSectionTitle}>Employee Earnings Summary</h4>
                            <span className={styles.reportSectionMeta}>Totals for selected {viewMode === "period" ? "pay period" : viewMode}</span>
                        </div>

                        {employeeTotals.length === 0 ? (
                            <div className={styles.payoutEmpty}>No employee payouts found for this period.</div>
                        ) : (
                            <div className={styles.payoutTableWrap}>
                                <table className={styles.dayPayoutTable}>
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Role</th>
                                            <th>Shifts</th>
                                            <th>Tips</th>
                                            <th>Gratuity</th>
                                            <th>Cash</th>
                                            <th>Total Pay</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employeeTotals.map(employee => (
                                            <tr key={employee.uid} className={styles.payoutRow}>
                                                <td className={styles.nameCell}>{employee.name}</td>
                                                <td className={styles.roleCell}>{ROLE_LABELS[employee.role] || employee.role}</td>
                                                <td>{employee.shifts}</td>
                                                <td>{fmt(employee.tips)}</td>
                                                <td>{fmt(employee.gratuity)}</td>
                                                <td>{fmt(employee.cash)}</td>
                                                <td className={styles.totalCell}>{fmt(employee.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminReportsPanel;
