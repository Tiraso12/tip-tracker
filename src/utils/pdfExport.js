import { RUNNER_FLAT_RATE } from './constants';

const PRIMARY_COLOR = [147, 51, 234]; // #9333ea (var(--primary))
const BACKGROUND_COLOR = [30, 41, 59]; // Dark mode equivalent (slate-800)

/**
 * Helper to determine what week in the month a date belongs to for grouping
 */
const getWeekLabel = (date) => {
    const d = new Date(date);
    const day = d.getDate();
    const weekNum = Math.ceil(day / 7);
    return `Week ${weekNum}`;
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
        `Revenue: $${((summary.derivedValues?.totalTeamSales || 0) + (summary.derivedValues?.barSales || parseInt(summary.normalizedInputs?.barTeam?.pools?.sales || 0) || 0)).toFixed(2)}`,
        `Tips: $${(summary.derivedValues?.ctpTotal || summary.normalizedInputs?.ctpTotal || 0).toFixed(2)}`,
        `Gratuity: $${(summary.derivedValues?.grtTotal || 0).toFixed(2)}`,
        `Cash: $${(summary.derivedValues?.baseTeamCash || summary.normalizedInputs?.cashTotal || 0).toFixed(2)}`
    ];

    let xOffset = 55;
    summaryTexts.forEach(text => {
        doc.text(text, xOffset, 120);
        xOffset += 110;
    });

    if (summary.normalizedInputs?.contract26Gratuity > 0) {
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text(`Contract Shift (26% Grat: $${summary.normalizedInputs.contract26Gratuity})`, 40, 160);
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
                    styles: { fillColor: [243, 232, 255], textColor: PRIMARY_COLOR, fontStyle: 'bold' }
                }]);
                arr.forEach(m => {
                    tableBody.push([
                        m.name,
                        isRunner ? 'Runner' : m.teamId?.replace('team-', 'Team ') || 'Bar',
                        `$${m.ctp}`,
                        `$${m.grt}`,
                        `$${m.cash || 0}`,
                        `$${m.total || m.payoutAmount}`
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
                        styles: { fillColor: [243, 232, 255], textColor: PRIMARY_COLOR, fontStyle: 'bold' }
                    }]);
                    teamGroup.payouts.forEach(m => {
                        tableBody.push([
                            m.name,
                            m.points,
                            `$${m.ctp}`,
                            `$${m.grt}`,
                            `$${m.cash}`,
                            `$${m.total}`
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
                                `$${m.ctp}`,
                                `$${m.grt}`,
                                '—',
                                `$${m.total}`
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
                            `$${m.ctp}`,
                            `$${m.grt}`,
                            '—',
                            `$${m.total}`
                        ]);
                    });
                }
            }

            // 3. Bar Team
            if (summary.payouts.barPayouts?.length > 0) {
                tableBody.push([{
                    content: 'BAR TEAM',
                    colSpan: 6,
                    styles: { fillColor: [243, 232, 255], textColor: PRIMARY_COLOR, fontStyle: 'bold' }
                }]);
                summary.payouts.barPayouts.forEach(m => {
                    tableBody.push([
                        m.name,
                        m.points,
                        `$${m.ctp}`,
                        `$${m.grt}`,
                        `$${m.cash || 0}`,
                        `$${m.total}`
                    ]);
                });
            }

            // 4. Runners
            if (summary.payouts.runners?.length > 0) {
                tableBody.push([{
                    content: 'RUNNERS',
                    colSpan: 6,
                    styles: { fillColor: [243, 232, 255], textColor: PRIMARY_COLOR, fontStyle: 'bold' }
                }]);
                summary.payouts.runners.forEach(m => {
                    tableBody.push([
                        m.name,
                        'Flat/Split',
                        `$${m.payoutAmount}`,
                        '—',
                        '—',
                        `$${m.payoutAmount}`
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
export const generateWeeklyReport = async (weekData, weekRangeLabel) => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF('l', 'pt', 'a4');

    // Header
    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFontSize(22);
    doc.text('TipTracker Weekly Report', 40, 50);

    doc.setTextColor(100);
    doc.setFontSize(12);
    doc.text(`Pay Period: ${weekRangeLabel}`, 40, 70);

    // Calculate Totals and aggregate employee payouts
    let totalTips = 0, totalGrat = 0, totalCash = 0, totalRev = 0;
    const dayRows = [];
    const employeeTotals = {}; // { uid: { name, role, tips, gratuity, cash, total } }

    weekData.forEach(day => {
        const r = Number(day.revenue) || 0;
        const g = Number(day.gratuity) || 0;
        const t = Number(day.tip) || 0;
        const c = Number(day.cash) || 0;
        const sum = g + t + c;

        totalRev += r;
        totalGrat += g;
        totalTips += t;
        totalCash += c;

        const dateStr = new Date(day.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

        dayRows.push([
            dateStr,
            `$${r.toFixed(2)}`,
            `$${t.toFixed(2)}`,
            `$${g.toFixed(2)}`,
            `$${c.toFixed(2)}`,
            `$${sum.toFixed(2)}`
        ]);

        // Aggregate employee payouts for the week
        if (day.payouts) {
            Object.entries(day.payouts).forEach(([uid, pay]) => {
                if (!employeeTotals[uid]) {
                    employeeTotals[uid] = {
                        name: pay.name, role: pay.role,
                        tips: 0, gratuity: 0, cash: 0, totalEarning: 0
                    };
                }
                employeeTotals[uid].tips += Number(pay.tips) || 0;
                employeeTotals[uid].gratuity += Number(pay.gratuity) || 0;
                employeeTotals[uid].cash += Number(pay.cash) || 0;
                // Exclude cash from total earnings as requested
                employeeTotals[uid].totalEarning += (Number(pay.tips) || 0) + (Number(pay.gratuity) || 0);
            });
        }
    });

    const grandTotal = totalTips + totalGrat + totalCash;

    // Totals Box
    doc.setDrawColor(...PRIMARY_COLOR);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(40, 90, doc.internal.pageSize.getWidth() - 80, 50, 3, 3, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Week Rev: $${totalRev.toFixed(2)}`, 55, 110);
    doc.text(`Tips: $${totalTips.toFixed(2)}`, 165, 110);
    doc.text(`Gratuity: $${totalGrat.toFixed(2)}`, 275, 110);

    doc.text(`Cash: $${totalCash.toFixed(2)}`, 55, 125);
    doc.text(`Week Pool: $${grandTotal.toFixed(2)}`, 165, 125);
    doc.text(`Week Tips/Grat: $${(totalTips + totalGrat).toFixed(2)}`, 275, 125);

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

    // 2. Employee Weekly Totals Table
    const employeeRows = [];
    const ROLE_ORDER = ["captain", "server", "back", "assistant", "bartender", "runner"];

    // Group weekly totals by role
    ROLE_ORDER.forEach(role => {
        const members = Object.values(employeeTotals).filter(m => m.role === role);
        if (members.length === 0) return;

        // Role Section Header
        employeeRows.push([{
            content: role.toUpperCase(),
            colSpan: 5,
            styles: { fillColor: [243, 232, 255], textColor: PRIMARY_COLOR, fontStyle: 'bold' }
        }]);

        // Role Members
        members.forEach(m => {
            employeeRows.push([
                m.name,
                `$${m.tips.toFixed(2)}`,
                `$${m.gratuity.toFixed(2)}`,
                `$${m.cash.toFixed(2)}`,
                `$${m.totalEarning.toFixed(2)}`
            ]);
        });
    });

    if (employeeRows.length > 0) {
        doc.setFontSize(14);
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text("Weekly Employee Payouts", 40, doc.lastAutoTable.finalY + 30);

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 45,
            head: [['Employee', 'Total Tips', 'Total Gratuity', 'Total Cash', 'Earnings (No Cash)']],
            body: employeeRows,
            theme: 'grid',
            headStyles: { fillColor: BACKGROUND_COLOR, textColor: 255 },
            styles: { fontSize: 9 },
            columnStyles: {
                0: { cellWidth: 120 },
                4: { fontStyle: 'bold', textColor: [0, 100, 0] }
            }
        });
    }

    doc.save(`Weekly_Report_${weekRangeLabel.replace(/[/\s-]/g, '_')}.pdf`);
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

    daysInMonthData.forEach(day => {
        const g = Number(day.gratuity) || 0;
        const t = Number(day.tip) || 0;
        const c = Number(day.cash) || 0;
        const r = Number(day.revenue) || 0;

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

    doc.text(`Month Rev: $${mRev.toFixed(2)}`, 55, 110);
    doc.text(`Tips: $${mTips.toFixed(2)}`, 165, 110);
    doc.text(`Gratuity: $${mGrat.toFixed(2)}`, 275, 110);

    doc.text(`Cash: $${mCash.toFixed(2)}`, 55, 125);
    doc.text(`Month Pool: $${mTotal.toFixed(2)}`, 165, 125);

    let currentY = 160;

    // Render tables per week
    Object.keys(groupedByWeek).sort().forEach(week => {
        const days = groupedByWeek[week];
        if (days.length === 0) return;

        // Week total
        const wTotal = days.reduce((acc, d) => acc + d.sum, 0);

        doc.setFontSize(12);
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text(`${week} Breakdown (Pool: $${wTotal.toFixed(2)})`, 40, currentY);

        const tableBody = days.map(d => [
            d.dateStr,
            `$${d.r.toFixed(2)}`,
            `$${d.t.toFixed(2)}`,
            `$${d.g.toFixed(2)}`,
            `$${d.c.toFixed(2)}`,
            `$${d.sum.toFixed(2)}`
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

        // Add new page if getting too low
        if (currentY > 750) {
            doc.addPage();
            currentY = 50;
        }
    });

    doc.save(`Monthly_Report_${monthName.replace(/\s/g, '_')}.pdf`);
};
