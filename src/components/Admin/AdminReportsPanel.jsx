import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getBiweeklyPeriod, getCurrentWeek, toDateKey } from "../../utils/dateUtils";
import { generateMonthlyReport, generateWeeklyReport } from "../../utils/pdfExport";
import { Button, Card, Select, Table, THead, TBody, TR, TH, TD } from "../ui";

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
const fmt = (n) => `$${toMoney(n).toFixed(2)}`;

function getShiftRevenue(shiftData) {
    if (!shiftData) return 0;
    const dv = shiftData.summary?.derivedValues;
    if (dv) {
        return toMoney(dv.totalTeamSales) + toMoney(dv.barSales);
    }
    const ni = shiftData.summary?.normalizedInputs;
    if (ni) {
        const teamSales = (ni.teams || []).reduce((sum, t) => sum + toMoney(t.pools?.sales || t.teamSales), 0);
        const barSales = toMoney(ni.barTeam?.pools?.sales) || toMoney(ni.barSales);
        return teamSales + barSales;
    }
    return 0;
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
            const total = tips + gratuity;
            const activityTotal = total + cash;

            employeeMap[uid].tips += tips;
            employeeMap[uid].gratuity += gratuity;
            employeeMap[uid].cash += cash;
            employeeMap[uid].total += total;
            employeeMap[uid].shifts += activityTotal > 0 ? 1 : 0;
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

function SummaryStat({ label, value, accent = false }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                {label}
            </span>
            <strong
                className={
                    "font-display text-xl font-medium tracking-tight tabular-nums " +
                    (accent ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]")
                }
            >
                {value}
            </strong>
        </div>
    );
}

function NavIconButton({ onClick, label, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className="h-10 w-10 inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
        >
            {children}
        </button>
    );
}

function AdminReportsPanel() {
    const [viewMode, setViewMode] = useState("week");
    const [baseDateStr, setBaseDateStr] = useState(() => toDateKey(new Date()));
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);

    const { startStr, endStr, displayLabel, dateKeys } = React.useMemo(() => {
        const d = new Date(baseDateStr + "T12:00:00");
        let keys = [];
        let start, end, label;

        if (viewMode === "week") {
            const weekDates = getCurrentWeek(d);
            start = weekDates[0];
            end = weekDates[6];
            keys = weekDates.map(toDateKey);
            label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        } else if (viewMode === "period") {
            const period = getBiweeklyPeriod(d);
            start = period.start;
            end = period.end;
            const cursor = new Date(start);
            while (cursor <= end) {
                keys.push(toDateKey(cursor));
                cursor.setDate(cursor.getDate() + 1);
            }
            label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        } else {
            const year = d.getFullYear();
            const month = d.getMonth();
            start = new Date(year, month, 1);
            end = new Date(year, month + 1, 0);
            const dayCount = end.getDate();
            for (let i = 1; i <= dayCount; i++) {
                const md = new Date(year, month, i);
                keys.push(toDateKey(md));
            }
            label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        }

        return {
            startStr: toDateKey(start),
            endStr: toDateKey(end),
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
                        const dv = sd.summary?.derivedValues;
                        if (dv) {
                            t = toMoney(dv.ctpTotal);
                            g = toMoney(dv.grtTotal);
                            c = toMoney(dv.baseTeamCash);
                        } else if (sd.payouts) {
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
        total: acc.total + d.tip + d.gratuity
    }), { tips: 0, gratuity: 0, cash: 0, revenue: 0, total: 0 });

    const employeeTotals = React.useMemo(() => buildEmployeeTotals(reportData), [reportData]);
    const workedDays = reportData.filter(d => Object.keys(d.payouts).length > 0).length;

    const changePeriod = (delta) => {
        const d = new Date(baseDateStr + "T12:00:00");
        if (viewMode === 'week') d.setDate(d.getDate() + (delta * 7));
        else if (viewMode === 'period') d.setDate(d.getDate() + (delta * 14));
        else d.setMonth(d.getMonth() + delta);
        setBaseDateStr(toDateKey(d));
    };

    return (
        <div className="space-y-6">
            <Card className="!p-0">
                {/* Controls */}
                <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-6 py-5 border-b border-[var(--color-line)]">
                    <div className="flex items-center gap-3">
                        <Select
                            value={viewMode}
                            onChange={e => setViewMode(e.target.value)}
                            className="min-w-[10rem]"
                        >
                            <option value="week">Weekly Report</option>
                            <option value="period">Pay Period Report</option>
                            <option value="month">Monthly Report</option>
                        </Select>
                        <div className="flex items-center gap-2">
                            <NavIconButton onClick={() => changePeriod(-1)} label="Previous">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                            </NavIconButton>
                            <input
                                type="date"
                                value={baseDateStr}
                                onChange={e => setBaseDateStr(e.target.value)}
                                className="h-10 px-3 text-sm font-mono tabular-nums bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] rounded-[var(--radius-sm)] hover:border-[var(--color-line-strong)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/15 transition-colors"
                            />
                            <NavIconButton onClick={() => changePeriod(1)} label="Next">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                            </NavIconButton>
                        </div>
                    </div>

                    {reportData.length > 0 ? (
                        <Button onClick={handleExport} disabled={loading} variant="secondary" size="sm">
                            {loading ? "Loading…" : "Export PDF"}
                        </Button>
                    ) : null}
                </header>

                {/* Period header */}
                <div className="px-6 py-5 border-b border-[var(--color-line)]">
                    <h4 className="font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">
                        {displayLabel}
                    </h4>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        {workedDays} worked {workedDays === 1 ? "day" : "days"} · {employeeTotals.length}{" "}
                        {employeeTotals.length === 1 ? "employee" : "employees"} paid
                    </p>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-[var(--color-line)] border-b border-[var(--color-line)]">
                    <div className="px-6 py-4">
                        <SummaryStat label="Revenue" value={fmt(totals.revenue)} />
                    </div>
                    <div className="px-6 py-4">
                        <SummaryStat label="Tips" value={fmt(totals.tips)} />
                    </div>
                    <div className="px-6 py-4">
                        <SummaryStat label="Gratuity" value={fmt(totals.gratuity)} />
                    </div>
                    <div className="px-6 py-4">
                        <SummaryStat label="Cash" value={fmt(totals.cash)} />
                    </div>
                    <div className="px-6 py-4 col-span-2 lg:col-span-1 bg-[var(--color-surface-muted)]/40">
                        <SummaryStat label="Period Pool" value={fmt(totals.total)} accent />
                    </div>
                </div>

                {/* Daily table */}
                <div className="px-6 py-6">
                    {loading ? (
                        <div className="text-center py-10 text-sm text-[var(--color-ink-soft)]">
                            Loading shift data…
                        </div>
                    ) : (
                        <Table>
                            <THead>
                                <tr>
                                    <TH>Date</TH>
                                    <TH numeric>Rev</TH>
                                    <TH numeric>Tips</TH>
                                    <TH numeric>Gratuity</TH>
                                    <TH numeric>Cash</TH>
                                    <TH numeric>Daily Pool (CTP+GRT)</TH>
                                </tr>
                            </THead>
                            <TBody>
                                {reportData.map(d => {
                                    const dailyTotal = d.tip + d.gratuity;
                                    const noData = dailyTotal === 0 && d.cash === 0 && Object.keys(d.payouts).length === 0;
                                    return (
                                        <TR
                                            key={d.date}
                                            className={noData ? "text-[var(--color-ink-muted)]" : ""}
                                        >
                                            <TD className="font-medium">
                                                {new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
                                                    weekday: "short",
                                                    month: "short",
                                                    day: "numeric",
                                                })}
                                            </TD>
                                            <TD numeric>{fmt(d.revenue)}</TD>
                                            <TD numeric>{fmt(d.tip)}</TD>
                                            <TD numeric>{fmt(d.gratuity)}</TD>
                                            <TD numeric>{fmt(d.cash)}</TD>
                                            <TD numeric className="font-semibold">{fmt(dailyTotal)}</TD>
                                        </TR>
                                    );
                                })}
                            </TBody>
                        </Table>
                    )}
                </div>
            </Card>

            {/* Employee earnings */}
            {!loading ? (
                <Card className="!p-0">
                    <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-6 py-5 border-b border-[var(--color-line)]">
                        <h4 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                            Employee Earnings Summary
                        </h4>
                        <span className="text-xs text-[var(--color-ink-soft)]">
                            Totals for selected {viewMode === "period" ? "pay period" : viewMode}
                        </span>
                    </header>

                    {employeeTotals.length === 0 ? (
                        <div className="px-6 py-10 text-center text-sm text-[var(--color-ink-muted)]">
                            No employee payouts found for this period.
                        </div>
                    ) : (
                        <div className="px-6 py-6">
                            <Table>
                                <THead>
                                    <tr>
                                        <TH>Employee</TH>
                                        <TH>Role</TH>
                                        <TH numeric>Shifts</TH>
                                        <TH numeric>Tips</TH>
                                        <TH numeric>Gratuity</TH>
                                        <TH numeric>Cash</TH>
                                        <TH numeric>Total Pay</TH>
                                    </tr>
                                </THead>
                                <TBody>
                                    {employeeTotals.map(employee => (
                                        <TR key={employee.uid}>
                                            <TD className="font-medium">{employee.name}</TD>
                                            <TD className="text-[var(--color-ink-soft)]">
                                                {ROLE_LABELS[employee.role] || employee.role}
                                            </TD>
                                            <TD numeric>{employee.shifts}</TD>
                                            <TD numeric>{fmt(employee.tips)}</TD>
                                            <TD numeric>{fmt(employee.gratuity)}</TD>
                                            <TD numeric>{fmt(employee.cash)}</TD>
                                            <TD numeric className="font-semibold">{fmt(employee.total)}</TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                        </div>
                    )}
                </Card>
            ) : null}
        </div>
    );
}

export default AdminReportsPanel;
