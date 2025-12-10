import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import styles from './Charts.module.css';

const COLORS = ['#8b5cf6', '#a78bfa', '#22c55e']; // Violet, Light Violet, Green (for Cash if distinct)
// Actually design uses: Grat (Purple), Tip (Blue/Cyan), Cash (Pink/Orange)?
// Screenshot 2: Grat (Purple), Tip (Blue), Cash (Cyan)
const CHART_COLORS = {
    grat: '#8b5cf6', // Violet
    tip: '#3b82f6',  // Blue
    cash: '#06b6d4'  // Cyan
};

function Charts({ weekData }) {
    const { pieData, barData } = useMemo(() => {
        if (!weekData) return { pieData: [], barData: [] };

        let totalGrat = 0;
        let totalTip = 0;
        let totalCash = 0;

        const bars = weekData.map(day => {
            const g = Number(day.gratuity) || 0;
            const t = Number(day.tip) || 0;
            const c = Number(day.cash) || 0;

            totalGrat += g;
            totalTip += t;
            totalCash += c;

            return {
                name: day.date.toLocaleDateString('en-US', { weekday: 'short' }),
                total: g + t + c,
                amt: g + t + c
            };
        });

        const pie = [
            { name: 'Grat', value: totalGrat, color: CHART_COLORS.grat },
            { name: 'Tip', value: totalTip, color: CHART_COLORS.tip },
            { name: 'Cash', value: totalCash, color: CHART_COLORS.cash },
        ].filter(item => item.value > 0);

        return { pieData: pie, barData: bars };
    }, [weekData]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>EARNINGS BREAKDOWN</h2>
                <p className={styles.subtitle}>Distribution & Weekly Trend</p>
            </div>

            <div className={styles.chartsGrid}>
                {/* Source / Distribution */}
                <div className={styles.chartSection}>
                    <h3 className={styles.chartLabel}>SOURCE</h3>
                    <div className={styles.pieContainer}>
                        <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={60}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className={styles.legend}>
                            {pieData.map(item => (
                                <div key={item.name} className={styles.legendItem}>
                                    <div className={styles.dot} style={{ background: item.color }} />
                                    <span>{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Trend */}
                <div className={styles.chartSection}>
                    <h3 className={styles.chartLabel}>TREND</h3>
                    <div className={styles.barContainer}>
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={barData}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                                    dy={10}
                                />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    cursor={{ fill: '#334155', opacity: 0.4 }}
                                />
                                <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 4, 4]} barSize={12} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Charts;
