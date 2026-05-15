import React, { useMemo } from "react";
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { Card } from "../ui";

// Three desaturated tones built on the new design palette: deep accent for
// gratuity (the largest pool), a soft sage for tips, a warm neutral for cash.
const SOURCE_COLORS = {
    grat: "#1a3d2e", // accent
    tip: "#7a9d8a",  // sage
    cash: "#b08968", // warm neutral
};

function Charts({ weekData }) {
    const { pieData, barData, totalEarnings } = useMemo(() => {
        if (!weekData) return { pieData: [], barData: [], totalEarnings: 0 };

        let totalGrat = 0;
        let totalTip = 0;
        let totalCash = 0;

        const bars = weekData.map((day) => {
            const g = Number(day.gratuity) || 0;
            const t = Number(day.tip) || 0;
            const c = Number(day.cash) || 0;

            totalGrat += g;
            totalTip += t;
            totalCash += c;

            return {
                name:
                    day.name ||
                    new Date(day.date).toLocaleDateString("en-US", { weekday: "short" }),
                total: g + t + c,
            };
        });

        const pie = [
            { name: "Grat", value: totalGrat, color: SOURCE_COLORS.grat },
            { name: "Tip", value: totalTip, color: SOURCE_COLORS.tip },
            { name: "Cash", value: totalCash, color: SOURCE_COLORS.cash },
        ].filter((item) => item.value > 0);

        return {
            pieData: pie,
            barData: bars,
            totalEarnings: totalGrat + totalTip + totalCash,
        };
    }, [weekData]);

    const hasEarnings = totalEarnings > 0;

    return (
        <Card className="!p-0">
            <header className="px-6 py-5 border-b border-[var(--color-line)]">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                    Earnings Breakdown
                </span>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    Distribution and weekly trend
                </p>
            </header>

            {hasEarnings ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--color-line)]">
                    {/* Source pie */}
                    <section className="px-6 py-6">
                        <h3 className="mb-4 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                            Source
                        </h3>
                        <div className="flex items-center gap-6">
                            <div className="shrink-0">
                                <ResponsiveContainer width={160} height={160}>
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={45}
                                            outerRadius={70}
                                            paddingAngle={3}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <ul className="flex flex-col gap-2.5">
                                {pieData.map((item) => (
                                    <li key={item.name} className="flex items-center gap-2.5 text-sm">
                                        <span
                                            className="h-2.5 w-2.5 rounded-sm shrink-0"
                                            style={{ background: item.color }}
                                        />
                                        <span className="text-[var(--color-ink-soft)] min-w-[2.5rem]">
                                            {item.name}
                                        </span>
                                        <span className="font-mono tabular-nums text-[var(--color-ink)]">
                                            {item.value.toLocaleString("en-US", {
                                                style: "currency",
                                                currency: "USD",
                                            })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>

                    {/* Trend bar */}
                    <section className="px-6 py-6">
                        <h3 className="mb-4 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                            Trend
                        </h3>
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={barData}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "#a3a3a3", fontSize: 10 }}
                                    dy={6}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: "#ffffff",
                                        border: "1px solid #e7e5e4",
                                        borderRadius: "6px",
                                        color: "#0a0a0a",
                                        fontSize: "12px",
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                                    }}
                                    cursor={{ fill: "#1a3d2e", opacity: 0.06 }}
                                    formatter={(v) =>
                                        v.toLocaleString("en-US", {
                                            style: "currency",
                                            currency: "USD",
                                        })
                                    }
                                />
                                <Bar dataKey="total" fill={SOURCE_COLORS.grat} radius={[3, 3, 0, 0]} barSize={14} />
                            </BarChart>
                        </ResponsiveContainer>
                    </section>
                </div>
            ) : (
                <div className="px-6 py-10 text-center">
                    <p className="font-display text-base font-medium text-[var(--color-ink)]">
                        No earnings to chart yet
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        Charts will appear after a saved payout is added to this view.
                    </p>
                </div>
            )}
        </Card>
    );
}

export default Charts;
