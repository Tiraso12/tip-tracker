const PRIMARY_COLOR = [26, 61, 46]; // #1a3d2e — forest green accent (matches v0.7.0 UI theme)
const PRIMARY_SOFT = [232, 239, 233]; // #e8efe9 — soft accent tint for section header backgrounds
const ROLE_ORDER = ["captain", "server", "back", "assistant", "bartender", "runner"];
const ROLE_LABELS = {
    captain: "CAPTAINS",
    server: "SERVERS",
    back: "BACKS",
    assistant: "ASSISTANTS",
    bartender: "BAR TEAM",
    runner: "RUNNERS",
};

const n = (value) => Number(value) || 0;
const currency = (value) => `$${n(value).toFixed(2)}`;

/**
 * Helper to determine what week in the month a date belongs to for grouping
 */
const getWeekLabel = (date) => {
    const d = new Date(date);
    const day = d.getDate();
    const weekNum = Math.ceil(day / 7);
    return `Week ${weekNum}`;
};

const buildEmployeeTotals = (days = []) => {
    const employeeTotals = {};

    days.forEach(day => {
        Object.entries(day.payouts || {}).forEach(([uid, pay]) => {
            if (!employeeTotals[uid]) {
                employeeTotals[uid] = {
                    uid,
                    name: pay.name || "Unknown",
                    role: pay.role || "staff",
                    shifts: 0,
                    tips: 0,
                    gratuity: 0,
                    cash: 0,
                    total: 0,
                };
            }

            const tips = n(pay.tips);
            const gratuity = n(pay.gratuity);
            const cash = n(pay.cash);
            const total = pay.total !== undefined ? n(pay.total) : tips + gratuity + cash;

            employeeTotals[uid].tips += tips;
            employeeTotals[uid].gratuity += gratuity;
            employeeTotals[uid].cash += cash;
            employeeTotals[uid].total += total;
            employeeTotals[uid].shifts += total > 0 ? 1 : 0;
        });
    });

    return Object.values(employeeTotals).sort((a, b) => {
        const aRoleRank = ROLE_ORDER.includes(a.role) ? ROLE_ORDER.indexOf(a.role) : ROLE_ORDER.length;
        const bRoleRank = ROLE_ORDER.includes(b.role) ? ROLE_ORDER.indexOf(b.role) : ROLE_ORDER.length;
        const roleDiff = aRoleRank - bRoleRank;
        if (roleDiff !== 0) return roleDiff;
        if (b.total !== a.total) return b.total - a.total;
        return a.name.localeCompare(b.name);
    });
};

const buildEmployeeRows = (employeeTotals = []) => {
    const rows = [];
    const roles = [...ROLE_ORDER, ...new Set(employeeTotals.map(employee => employee.role).filter(role => !ROLE_ORDER.includes(role)))];

    roles.forEach(role => {
        const members = employeeTotals.filter(employee => employee.role === role);
        if (members.length === 0) return;

        rows.push([{
            content: ROLE_LABELS[role] || role.toUpperCase(),
            colSpan: 7,
            styles: { fillColor: PRIMARY_SOFT, textColor: PRIMARY_COLOR, fontStyle: 'bold' }
        }]);

        members.forEach(employee => {
            rows.push([
                employee.name,
                employee.shifts,
                currency(employee.tips),
                currency(employee.gratuity),
                currency(employee.cash),
                currency(employee.total),
                currency(employee.shifts > 0 ? employee.total / employee.shifts : 0),
            ]);
        });
    });

    return rows;
};

const addEmployeeTotalsTable = (doc, autoTable, title, employeeTotals, startY) => {
    const employeeRows = buildEmployeeRows(employeeTotals);
    if (employeeRows.length === 0) return startY;

    const pageHeight = doc.internal.pageSize.getHeight();
    let nextY = startY;
    if (nextY > pageHeight - 140) {
        doc.addPage();
        nextY = 50;
    }

    doc.setFontSize(14);
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text(title, 40, nextY);

    autoTable(doc, {
        startY: nextY + 15,
        head: [['Employee', 'Shifts', 'Tips', 'Gratuity', 'Cash', 'Total Pay', 'Avg Shift']],
        body: employeeRows,
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR, textColor: 255 },
        styles: { fontSize: 9 },
        columnStyles: {
            0: { cellWidth: 120 },
            5: { fontStyle: 'bold', textColor: [0, 100, 0] }
        }
    });

    return doc.lastAutoTable.finalY;
};

/**
 * Generate a detailed PDF report for a single Shift
 */
export const generateShiftReport = async (date, summary) => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    // 1. Setup PDF in portrait mode
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // 2. Header
    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFontSize(22);
    doc.text('TipTracker Shift Report', 40, 50);

    doc.setTextColor(100);
    doc.setFontSize(12);
    doc.text(`Date: ${new Date(date + 'T12:00:00').toLocaleDateString()}`, 40, 70);

    // 3. Totals Summary Box
    doc.setDrawColor(...PRIMARY_COLOR);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(40, 90, pageWidth - 80, 50, 3, 3, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(50);

    const summaryTexts = [
        `Revenue: ${currency((summary.derivedValues?.totalTeamSales || 0) + (summary.derivedValues?.barSales || parseInt(summary.normalizedInputs?.barTeam?.pools?.sales || 0) || 0))}`,
        `Tips: ${currency(summary.derivedValues?.ctpTotal || summary.normalizedInputs?.ctpTotal || 0)}`,
        `Gratuity: ${currency(summary.derivedValues?.grtTotal || 0)}`,
        `Cash: ${currency(summary.derivedValues?.baseTeamCash || summary.normalizedInputs?.cashTotal || 0)}`
    ];

    let xOffset = 55;
    summaryTexts.forEach(text => {
        doc.text(text, xOffset, 120);
        xOffset += 110;
    });

    if (summary.normalizedInputs?.contract26Gratuity > 0) {
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text(`Contract Shift (26% Grat: ${currency(summary.normalizedInputs.contract26Gratuity)})`, 40, 160);
    }

    // 4. Employee Payouts Table
    if (!summary || !summary.payouts) {
        doc.text("No valid calculation summary found for this shift.", 40, 190);
    } else {
        const tableBody = [];

        if (summary.payouts.roleGrouped) {
            const { roleGrouped } = summary.payouts;

            const addGroup = (title, arr, isRunner = false) => {
                if (!arr || arr.length === 0) return;
                tableBody.push([{
                    content: title,
                    colSpan: 6,
                    styles: { fillColor: PRIMARY_SOFT, textColor: PRIMARY_COLOR, fontStyle: 'bold' }
                }]);
                arr.forEach(m => {
                    tableBody.push([
                        m.name,
                        isRunner ? 'Runner' : m.teamId?.replace('team-', 'Team ') || 'Bar',
                        currency(m.ctp),
                        currency(m.grt),
                        currency(m.cash || 0),
                        currency(m.total || m.payoutAmount)
                    ]);
                });
            };

            addGroup('CAPTAINS', roleGrouped.captains);
            addGroup('SERVERS', roleGrouped.servers);
            addGroup('BACKS', roleGrouped.backs);
            addGroup('ASSISTANTS', roleGrouped.assistants);
            addGroup('BAR TEAM', roleGrouped.bar);
            addGroup('RUNNERS', roleGrouped.runners, true);

        } else {
            // 1. Teams
            if (summary.payouts.teamPayouts?.length > 0) {
                summary.payouts.teamPayouts.forEach((teamGroup, idx) => {
                    tableBody.push([{
                        content: `TEAM ${idx + 1}`,
                        colSpan: 6,
                        styles: { fillColor: PRIMARY_SOFT, textColor: PRIMARY_COLOR, fontStyle: 'bold' }
                    }]);
                    teamGroup.payouts.forEach(m => {
                        tableBody.push([
                            m.name,
                            m.points,
                            currency(m.ctp),
                            currency(m.grt),
                            currency(m.cash),
                            currency(m.total)
                        ]);
                    });
                });
            }

            // 2. Captain Overrides
            if (summary.payouts.captainsOverride?.length > 0) {
                // If it's the old grouped format
                const isGrouped = Array.isArray(summary.payouts.captainsOverride[0]?.payouts);
                if (isGrouped) {
                    summary.payouts.captainsOverride.forEach((teamGroup, idx) => {
                        tableBody.push([{
                            content: `TEAM ${idx + 1} CAPTAINS OVERRIDE`,
                            colSpan: 6,
                            styles: { fillColor: [255, 240, 245], textColor: [200, 50, 100], fontStyle: 'bold' }
                        }]);
                        teamGroup.payouts.forEach(m => {
                            tableBody.push([
                                m.name,
                                '—',
                                currency(m.ctp),
                                currency(m.grt),
                                '—',
                                currency(m.total)
                            ]);
                        });
                    });
                } else {
                    tableBody.push([{
                        content: `CAPTAINS OVERRIDE`,
                        colSpan: 6,
                        styles: { fillColor: [255, 240, 245], textColor: [200, 50, 100], fontStyle: 'bold' }
                    }]);
                    summary.payouts.captainsOverride.forEach(m => {
                        tableBody.push([
                            m.name,
                            '—',
                            currency(m.ctp),
                            currency(m.grt),
                            '—',
                            currency(m.total)
                        ]);
                    });
                }
            }

            // 3. Bar Team
            if (summary.payouts.barPayouts?.length > 0) {
                tableBody.push([{
                    content: 'BAR TEAM',
                    colSpan: 6,
                    styles: { fillColor: PRIMARY_SOFT, textColor: PRIMARY_COLOR, fontStyle: 'bold' }
                }]);
                summary.payouts.barPayouts.forEach(m => {
                    tableBody.push([
                        m.name,
                        m.points,
                        currency(m.ctp),
                        currency(m.grt),
                        currency(m.cash || 0),
                        currency(m.total)
                    ]);
                });
            }

            // 4. Runners
            if (summary.payouts.runners?.length > 0) {
                tableBody.push([{
                    content: 'RUNNERS',
                    colSpan: 6,
                    styles: { fillColor: PRIMARY_SOFT, textColor: PRIMARY_COLOR, fontStyle: 'bold' }
                }]);
                summary.payouts.runners.forEach(m => {
                    tableBody.push([
                        m.name,
                        'Flat/Split',
                        currency(m.payoutAmount),
                        '—',
                        '—',
                        currency(m.payoutAmount)
                    ]);
                });
            }
        }

        autoTable(doc, {
            startY: summary.isContract ? 175 : 160,
            head: [['Employee', 'Pts', 'Tips', 'Gratuity', 'Cash', 'Total Payout']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: PRIMARY_COLOR, textColor: 255 },
            styles: { fontSize: 9 },
            columnStyles: {
                0: { cellWidth: 100 },
                5: { fontStyle: 'bold', textColor: [0, 100, 0] } // Total column
            }
        });
    }

    // 5. Save
    doc.save(`Shift_Report_${date}.pdf`);
};

/**
 * Generate a PDF report for a Week (Biweekly view fallback)
 */
export const generateWeeklyReport = async (weekData, weekRangeLabel, reportLabel = 'Weekly') => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF('l', 'pt', 'a4');

    // Header
    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFontSize(22);
    doc.text(`TipTracker ${reportLabel} Report`, 40, 50);

    doc.setTextColor(100);
    doc.setFontSize(12);
    doc.text(`Range: ${weekRangeLabel}`, 40, 70);

    // Calculate Totals and aggregate employee payouts
    let totalTips = 0, totalGrat = 0, totalCash = 0, totalRev = 0;
    const dayRows = [];

    weekData.forEach(day => {
        const r = n(day.revenue);
        const g = n(day.gratuity);
        const t = n(day.tip);
        const c = n(day.cash);
        const sum = g + t + c;

        totalRev += r;
        totalGrat += g;
        totalTips += t;
        totalCash += c;

        const dateStr = new Date(day.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

        dayRows.push([
            dateStr,
            currency(r),
            currency(t),
            currency(g),
            currency(c),
            currency(sum)
        ]);
    });

    const grandTotal = totalTips + totalGrat + totalCash;
    const employeeTotals = buildEmployeeTotals(weekData);

    // Totals Box
    doc.setDrawColor(...PRIMARY_COLOR);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(40, 90, doc.internal.pageSize.getWidth() - 80, 50, 3, 3, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`${reportLabel} Rev: ${currency(totalRev)}`, 55, 110);
    doc.text(`Tips: ${currency(totalTips)}`, 165, 110);
    doc.text(`Gratuity: ${currency(totalGrat)}`, 275, 110);

    doc.text(`Cash: ${currency(totalCash)}`, 55, 125);
    doc.text(`${reportLabel} Pool: ${currency(grandTotal)}`, 165, 125);
    doc.text(`${reportLabel} Tips/Grat: ${currency(totalTips + totalGrat)}`, 275, 125);

    // 1. Daily Breakdown Table
    autoTable(doc, {
        startY: 160,
        head: [['Date', 'Revenue', 'Tips', 'Gratuity', 'Cash', 'Daily Pool']],
        body: dayRows,
        theme: 'striped',
        headStyles: { fillColor: PRIMARY_COLOR, textColor: 255 },
        styles: { fontSize: 10 },
        columnStyles: { 5: { fontStyle: 'bold' } }
    });

    addEmployeeTotalsTable(doc, autoTable, "Employee Earnings Summary", employeeTotals, doc.lastAutoTable.finalY + 30);

    doc.save(`${reportLabel.replace(/\s/g, '_')}_Report_${weekRangeLabel.replace(/[/\s-]/g, '_')}.pdf`);
};

/**
 * Generate a PDF report for a Month, grouped by weeks
 */
export const generateMonthlyReport = async (monthName, daysInMonthData) => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF('l', 'pt', 'a4');

    // Header
    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFontSize(22);
    doc.text('TipTracker Monthly Report', 40, 50);

    doc.setTextColor(100);
    doc.setFontSize(12);
    doc.text(`Month: ${monthName}`, 40, 70);

    // Calculate Month Totals and Group by week
    let mTips = 0, mGrat = 0, mCash = 0, mRev = 0;
    const groupedByWeek = {};
    const employeeTotals = buildEmployeeTotals(daysInMonthData);

    daysInMonthData.forEach(day => {
        const g = n(day.gratuity);
        const t = n(day.tip);
        const c = n(day.cash);
        const r = n(day.revenue);

        if (g === 0 && t === 0 && c === 0 && r === 0) return; // Skip empty days

        mTips += t;
        mGrat += g;
        mCash += c;
        mRev += r;

        const weekLabel = getWeekLabel(day.date);
        if (!groupedByWeek[weekLabel]) groupedByWeek[weekLabel] = [];

        groupedByWeek[weekLabel].push({
            dateStr: new Date(day.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            t, g, c, r, sum: t + g + c
        });
    });

    const mTotal = mTips + mGrat + mCash;

    // Totals Box
    doc.setDrawColor(...PRIMARY_COLOR);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(40, 90, doc.internal.pageSize.getWidth() - 80, 50, 3, 3, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(50);

    doc.text(`Month Rev: ${currency(mRev)}`, 55, 110);
    doc.text(`Tips: ${currency(mTips)}`, 165, 110);
    doc.text(`Gratuity: ${currency(mGrat)}`, 275, 110);

    doc.text(`Cash: ${currency(mCash)}`, 55, 125);
    doc.text(`Month Pool: ${currency(mTotal)}`, 165, 125);
    doc.text(`Month Tips/Grat: ${currency(mTips + mGrat)}`, 275, 125);

    let currentY = 160;
    const pageHeight = doc.internal.pageSize.getHeight();

    // Render tables per week
    Object.keys(groupedByWeek).sort().forEach(week => {
        const days = groupedByWeek[week];
        if (days.length === 0) return;

        if (currentY > pageHeight - 80) {
            doc.addPage();
            currentY = 50;
        }

        // Week total
        const wTotal = days.reduce((acc, d) => acc + d.sum, 0);

        doc.setFontSize(12);
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text(`${week} Breakdown (Pool: ${currency(wTotal)})`, 40, currentY);

        const tableBody = days.map(d => [
            d.dateStr,
            currency(d.r),
            currency(d.t),
            currency(d.g),
            currency(d.c),
            currency(d.sum)
        ]);

        autoTable(doc, {
            startY: currentY + 10,
            head: [['Date', 'Revenue', 'Tips', 'Gratuity', 'Cash', 'Daily Pool']],
            body: tableBody,
            theme: 'plain',
            headStyles: { borderBottomColor: [200, 200, 200], borderBottomWidth: 1, textColor: 100 },
            styles: { fontSize: 9 },
            columnStyles: { 5: { fontStyle: 'bold' } },
            margin: { bottom: 20 }
        });

        currentY = doc.lastAutoTable.finalY + 30;
    });

    addEmployeeTotalsTable(doc, autoTable, "Employee Earnings Summary", employeeTotals, currentY);

    doc.save(`Monthly_Report_${monthName.replace(/\s/g, '_')}.pdf`);
};
