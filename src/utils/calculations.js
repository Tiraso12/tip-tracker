export function calculatePeriodTotals(currentWeekData, start, end) {
    if (!start) return { gratuity: 0, tip: 0, cash: 0, total: 0 };

    // 1. Get all 14 date strings for the period
    const dates = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }

    // 2. Load saved data synchronously (safe for small local data)
    const savedJSON = localStorage.getItem("tip-tracker-data");
    const savedData = savedJSON ? JSON.parse(savedJSON) : {};

    // 3. Sum up
    let totalGratuity = 0;
    let totalTip = 0;
    let totalCash = 0;

    dates.forEach(dateKey => {
        // Check if this date is in the provided current week data override
        // currentWeekData is array of objects with .dateKey
        const liveDay = currentWeekData?.find(d => d.dateKey === dateKey);

        if (liveDay) {
            totalGratuity += Number(liveDay.gratuity) || 0;
            totalTip += Number(liveDay.tip) || 0;
            totalCash += Number(liveDay.cash) || 0;
        } else {
            // Use saved data
            const dayData = savedData[dateKey];
            if (dayData) {
                totalGratuity += Number(dayData.gratuity) || 0;
                totalTip += Number(dayData.tip) || 0;
                totalCash += Number(dayData.cash) || 0;
            }
        }
    });

    const total = totalGratuity + totalTip + totalCash;
    const daysWithData = Math.max(1, dates.length); // Or actual days filled? sticking to logic

    return {
        gratuity: totalGratuity,
        tip: totalTip,
        cash: totalCash,
        total: total,
        averageDaily: total / 14,
        projected: (total / daysWithData) * 14
    };
}
