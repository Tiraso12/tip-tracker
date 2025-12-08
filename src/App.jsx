import React, { useState, useEffect } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import Summary from "./components/Summary/Summary";
import layout from "./styles/AppLayout.module.css"
import WeekHeader from "./components/WeekHeader/WeekHeader";
import { getCurrentWeek } from "./utils/dateUtils";

import BiweeklySummary from "./components/BiweeklySummary/BiweeklySummary";
import DataService from "./services/dataService";
import { seedDatabase } from "./utils/seeder";

function App() {
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekData, setWeekData] = useState(null);
  const [currentWeekDates, setCurrentWeekDates] = useState([]);

  useEffect(() => {
    // Initialize the week based on baseDate
    const dates = getCurrentWeek(baseDate);
    setCurrentWeekDates(dates);
    const dateKeys = dates.map(d => d.toISOString().split('T')[0]);

    // Initialize with empty/loading structure to avoid flicker if desired, 
    // or just let subscription fill it.
    // We need to map the incoming data to our array index structure.

    // Initial structure map
    const initialDataMap = {};
    dates.forEach(date => {
      const key = date.toISOString().split('T')[0];
      initialDataMap[key] = {
        date: date,
        dateKey: key,
        gratuity: "",
        tip: "",
        cash: ""
      };
    });

    // Sub function to update state safely
    const handleRealTimeUpdate = (key, data) => {
      setWeekData(prev => {
        // prev might be null initially
        const currentData = prev ? [...prev] : dates.map(d => {
          const k = d.toISOString().split('T')[0];
          return initialDataMap[k];
        });

        const index = currentData.findIndex(d => d.dateKey === key);
        if (index !== -1) {
          currentData[index] = {
            ...currentData[index],
            gratuity: data.gratuity || "",
            tip: data.tip || "",
            cash: data.cash || ""
          };
        }
        return currentData;
      });
    };

    // Subscribe
    const unsubscribe = DataService.subscribeToWeek(dateKeys, handleRealTimeUpdate);

    // Initial load (optional, subscription handles it but might be slightly delayed)
    // Actually subscription emits immediately with current state if cached or fetched.
    // But let's set initial state to avoid null.
    setWeekData(dates.map(d => initialDataMap[d.toISOString().split('T')[0]]));

    return () => {
      unsubscribe();
    };
  }, [baseDate]);

  // Handle data updates
  const handleUpdate = async (index, field, value) => {
    // 1. Optimistic UI update (optional now with real-time, but makes it snappy)
    // We can keep it to prevent input lag, but real-time will overwrite it shortly.
    setWeekData(prev => {
      const newData = [...prev];
      newData[index] = { ...newData[index], [field]: value };
      return newData;
    });

    // 2. Persist to data service
    const dayToUpdate = weekData[index];
    const updatedDayData = {
      gratuity: field === 'gratuity' ? value : dayToUpdate.gratuity,
      tip: field === 'tip' ? value : dayToUpdate.tip,
      cash: field === 'cash' ? value : dayToUpdate.cash
    };

    if (field !== 'gratuity' && field !== 'tip' && field !== 'cash') return; // Safety

    // We can fire and forget, or handle error. 
    await DataService.saveData(dayToUpdate.dateKey, updatedDayData);
  };

  const handleChangeWeek = (direction) => {
    setBaseDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (direction * 7));
      return newDate;
    });
  };

  if (!weekData) return null; // or loading spinner

  return (
    <main className={layout.app}>
      {/* <header style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', alignItems: 'center' }}>
        Temporary Seed Button
        <button
          onClick={seedDatabase}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#ff4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.8rem'
          }}
        >
          DEBUG: Seed DB
        </button>
      </header> */}

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
