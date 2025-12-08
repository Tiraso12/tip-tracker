import React, { useState, useEffect } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import Summary from "./components/Summary/Summary";
import layout from "./styles/AppLayout.module.css"
import WeekHeader from "./components/WeekHeader/WeekHeader";
import { getCurrentWeek, isSameDay } from "./utils/dateUtils";

import BiweeklySummary from "./components/BiweeklySummary/BiweeklySummary";

function App() {
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekData, setWeekData] = useState(null);
  const [currentWeekDates, setCurrentWeekDates] = useState([]);

  useEffect(() => {
    // Initialize the week based on baseDate
    const dates = getCurrentWeek(baseDate);
    setCurrentWeekDates(dates);

    // Load saved data
    const savedJSON = localStorage.getItem("tip-tracker-data");
    const savedData = savedJSON ? JSON.parse(savedJSON) : {};

    // Map dates to data structure
    const initialData = dates.map(date => {
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD as key
      return {
        date: date,
        dateKey: dateKey,
        gratuity: savedData[dateKey]?.gratuity || "",
        tip: savedData[dateKey]?.tip || "",
        cash: savedData[dateKey]?.cash || ""
      };
    });

    setWeekData(initialData);
  }, [baseDate]);

  useEffect(() => {
    if (!weekData) return;
    // Persist to local storage whenever data changes
    const savedJSON = localStorage.getItem("tip-tracker-data");
    const existingData = savedJSON ? JSON.parse(savedJSON) : {};

    // Merge current week changes into existing data
    const persistenceObject = { ...existingData };
    weekData.forEach(day => {
      persistenceObject[day.dateKey] = {
        gratuity: day.gratuity,
        tip: day.tip,
        cash: day.cash
      };
    });

    localStorage.setItem("tip-tracker-data", JSON.stringify(persistenceObject));
  }, [weekData]);


  const handleUpdate = (index, field, value) => {
    setWeekData(prev => {
      const newData = [...prev];
      newData[index] = { ...newData[index], [field]: value };
      return newData;
    });
  };

  const handleChangeWeek = (direction) => {
    setBaseDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (direction * 7));
      return newDate;
    });
  };

  // Seed Dummy Data for Testing
  useEffect(() => {
    const existing = localStorage.getItem("tip-tracker-data");
    if (!existing) {
      // Create some dummy data around the anchor date (Nov 21, 2025) and current date
      const dummyData = {};
      const anchor = new Date(); // Use today as reference for immediate visibility
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
      // Force reload by updating baseDate slightly or just let next render pick it up?
      // Actually, the initial load happens on mount. If we seed here, we might need to update state if this effect runs after mount initialization.
      // But since we write to LS, next reload will have it. 
      // To make it instant, let's explicitly setWeekData if it's currently empty?
      // Simpler: Just rely on the user navigating or reloading, OR just update the state directly if empty.
      // Given this is for testing, a reload is acceptable, but let's try to be nice.
      window.location.reload(); // Hard reload to ensure all state effects pick up the seeded data properly
    }
  }, []);

  if (!weekData) return null; // or loading spinner

  return (
    <main className={layout.app}>
      <div className={layout.section}><Header /></div>
      <WeekHeader
        startDate={currentWeekDates[0]}
        endDate={currentWeekDates[6]}
        onPrev={() => handleChangeWeek(-1)}
        onNext={() => handleChangeWeek(1)}
      />
      <div className={layout.section}>
        <Calendar weekData={weekData} onUpdate={handleUpdate} />
      </div>

      <div className={`${layout.section} ${layout.summaryContainer}`}>
        <Summary weekData={weekData} />
        <BiweeklySummary
          currentWeekData={weekData}
          currentWeekStart={currentWeekDates[0]}
        />
      </div>
    </main>
  );
}

export default App;
