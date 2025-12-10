import { useState, useEffect, useCallback } from "react";
import { getCurrentWeek } from "../utils/dateUtils";

export function useTipData(baseDate = new Date()) {
    const [weekData, setWeekData] = useState(null);
    const [allData, setAllData] = useState({});
    const [currentWeekDates, setCurrentWeekDates] = useState([]);

    // Seed Data Helper
    const seedData = useCallback(() => {
        const existing = localStorage.getItem("tip-tracker-data");
        if (!existing) {
            const dummyData = {};
            const anchor = new Date();
            // Seed past 7 days
            for (let i = 0; i < 7; i++) {
                const d = new Date(anchor);
                d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                dummyData[k] = { gratuity: (100 + i * 10), tip: (20 + i), cash: (5 + i) };
            }
            // Seed next week
            for (let i = 1; i <= 7; i++) {
                const d = new Date(anchor);
                d.setDate(d.getDate() + i);
                const k = d.toISOString().split('T')[0];
                dummyData[k] = { gratuity: 50, tip: 10, cash: 0 };
            }
            localStorage.setItem("tip-tracker-data", JSON.stringify(dummyData));
            return dummyData; // Return for immediate use
        }
        return existing ? JSON.parse(existing) : {};
    }, []);

    // Initialize Data
    useEffect(() => {
        // 1. Calculate Week Dates
        const dates = getCurrentWeek(baseDate);
        setCurrentWeekDates(dates);

        // 2. Load or Seed Data
        let savedData = {};
        const stored = localStorage.getItem("tip-tracker-data");
        if (stored) {
            savedData = JSON.parse(stored);
        } else {
            savedData = seedData();
            // Consider reloading or just setting state. 
            // Setting state is cleaner than window.location.reload()
        }
        setAllData(savedData);

        // 3. Map to Week Data
        const mappedWeek = dates.map(date => {
            const dateKey = date.toISOString().split('T')[0];
            return {
                date: date,
                dateKey: dateKey,
                gratuity: savedData[dateKey]?.gratuity || "",
                tip: savedData[dateKey]?.tip || "",
                cash: savedData[dateKey]?.cash || ""
            };
        });

        setWeekData(mappedWeek);

    }, [baseDate, seedData]);

    const handleUpdate = (dateKey, field, value) => {
        // 1. Update Persistent Storage & All Data State
        setAllData(prev => {
            const updated = { ...prev };
            if (!updated[dateKey]) updated[dateKey] = { gratuity: "", tip: "", cash: "" };
            updated[dateKey] = { ...updated[dateKey], [field]: value };
            localStorage.setItem("tip-tracker-data", JSON.stringify(updated));
            return updated;
        });

        // 2. Update Current Week View State (Instant Feedback)
        setWeekData(prev => {
            if (!prev) return prev;
            return prev.map(day => {
                if (day.dateKey === dateKey) {
                    return { ...day, [field]: value };
                }
                return day;
            });
        });
    };

    return {
        weekData,
        allData,
        currentWeekDates,
        handleUpdate
    };
}
