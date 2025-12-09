import { getCurrentWeek } from "../utils/dateUtils";

const DB_KEY = "tip-tracker-data";

// Seed data if empty
function ensureData() {
    const existing = localStorage.getItem(DB_KEY);
    let dummyData = existing ? JSON.parse(existing) : {};

    // Helper to add data if missing
    const addDay = (dateStr, data) => {
        if (!dummyData[dateStr]) {
            dummyData[dateStr] = data;
        }
    };

    const anchor = new Date();

    // Ensure we have some recent data (original logic mostly preserved but expanded)
    // Seed past 7 days if empty
    if (!existing) {
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
    }

    // Explicitly fill November and December 2025
    // Nov 2025: 30 days
    for (let d = 1; d <= 30; d++) {
        const dayStr = d.toString().padStart(2, '0');
        const k = `2025-11-${dayStr}`;
        // Randomize slightly for realism
        addDay(k, {
            gratuity: Math.floor(Math.random() * 100) + 50,
            tip: Math.floor(Math.random() * 50) + 10,
            cash: Math.floor(Math.random() * 20)
        });
    }

    // Dec 2025: 31 days
    for (let d = 1; d <= 31; d++) {
        const dayStr = d.toString().padStart(2, '0');
        const k = `2025-12-${dayStr}`;
        addDay(k, {
            gratuity: Math.floor(Math.random() * 150) + 50,
            tip: Math.floor(Math.random() * 60) + 15,
            cash: Math.floor(Math.random() * 30)
        });
    }

    localStorage.setItem(DB_KEY, JSON.stringify(dummyData));
}

export const mockApp = {
    subscribeToWeek: (startOfWeekDate, onUpdate) => {
        ensureData();

        const loadAndEmit = () => {
            const savedJSON = localStorage.getItem(DB_KEY);
            const allData = savedJSON ? JSON.parse(savedJSON) : {};

            // Filter for the requested week
            // (This logic actually belongs in the component or we return a map, 
            // but to match the previous App.jsx logic we can just return the raw object 
            // or the specific array. Let's return the simplified map for the requested dates)

            // Actually, Firestore 'onSnapshot' usually returns a snapshot of interactions.
            // To keep the abstraction simple, let's just emit the 'allData' map 
            // and let the component pick what it needs, mirroring the current implementation.

            // Simulate network latency
            setTimeout(() => {
                onUpdate(allData);
            }, 300);
        };

        // Initial load
        loadAndEmit();

        // Listen for storage events (if we wanted multi-tab sync)
        // For now, simpler: we just return a cleanup function.
        // In a real mock, we might use a custom event dispatcher if we wanted 
        // updates from 'updateDay' to trigger this.

        // Let's create a simple event listener for local updates to trigger re-renders
        const handleLocalUpdate = () => loadAndEmit();
        window.addEventListener('mock-db-update', handleLocalUpdate);

        return () => {
            window.removeEventListener('mock-db-update', handleLocalUpdate);
        };
    },

    updateDay: async (dateKey, data) => {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 200));

        const savedJSON = localStorage.getItem(DB_KEY);
        const allData = savedJSON ? JSON.parse(savedJSON) : {};

        allData[dateKey] = { ...allData[dateKey], ...data };

        localStorage.setItem(DB_KEY, JSON.stringify(allData));

        // Trigger update for subscribers
        window.dispatchEvent(new Event('mock-db-update'));
    }
};
