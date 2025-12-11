import React, { useState, useEffect } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import MonthView from "./components/Calendar/MonthView";
import Charts from "./components/Charts/Charts";
import layout from "./styles/AppLayout.module.css"

import WeekHeader from "./components/WeekHeader/WeekHeader";
import { getCurrentWeek, getCalendarMonth } from "./utils/dateUtils";

import BiweeklySummary from "./components/BiweeklySummary/BiweeklySummary";
import DataService from "./services/dataService";
import Login from "./components/Auth/Login";


import { useAuth } from "./context/AuthContext";

function App() {
  const { user, loading } = useAuth();
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekData, setWeekData] = useState(null);
  const [currentWeekDates, setCurrentWeekDates] = useState([]);
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [allData, setAllData] = useState({});

  useEffect(() => {
    if (user) {
      DataService.setUserId(user.uid);
    } else {
      DataService.setUserId(null);
    }
  }, [user]);

  useEffect(() => {
    // Week Mode Logic
    if (viewMode === 'week') {
      // Initialize the week based on baseDate
      const dates = getCurrentWeek(baseDate);
      setCurrentWeekDates(dates);
      const dateKeys = dates.map(d => d.toISOString().split('T')[0]);

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

      // Load saved data to allData
      const savedJSON = localStorage.getItem("tip-tracker-data");
      const savedData = savedJSON ? JSON.parse(savedJSON) : {};
      setAllData(savedData);

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

      // Initial load 
      setWeekData(dates.map(d => initialDataMap[d.toISOString().split('T')[0]]));

      return () => {
        unsubscribe();
      };
    } else {
      // Feature-ui uses viewMode='month', develop uses currentView='month'
      // If we switch to viewMode, we need to adapt this block.
    }
  }, [baseDate, viewMode]);
  /* REMOVED useEffect [weekData] for persistence, moving logic to handleUpdate for robust multi-view support */

  const handleUpdate = async (dateKey, updates) => {
    // updates is an object { gratuity?, tip?, cash? }

    // Update allData and Persist (feature-ui way + DataService)
    setAllData(prev => {
      const updated = { ...prev };
      // Ensure object exists
      if (!updated[dateKey]) updated[dateKey] = { gratuity: "", tip: "", cash: "" };

      updated[dateKey] = { ...updated[dateKey], ...updates };

      localStorage.setItem("tip-tracker-data", JSON.stringify(updated));
      return updated;
    });

    // Update weekData so currently visible WeekView updates instantly
    setWeekData(prev => {
      if (!prev) return prev;
      return prev.map(day => {
        if (day.dateKey === dateKey) {
          return { ...day, ...updates };
        }
        return day;
      });
    });

    // 2. Persist to data service
    // We need the latest state. Since state updates are async, we use the 'updates' object
    // combined with what we know.
    // However, to be safe, we can fetch or just rely on what we have.
    // Better: Construct the full object from 'allData' (but that's stale inside function).
    // Safest: Use setAllData callback or just merge with prev weekData if available.

    // Let's grab the current day data from weekData or allData to merge unchanged fields?
    // Actually, 'updates' might be partial? 
    // The requirement says "DayCard... send batch updates". 
    // DayCard sends { gratuity, tip, cash }. So it's a full update of those fields.
    // So we can often just overwrite or merge.

    // We'll merge with existing to be safe.
    // Note: weekData state might be stale here if we just use 'weekData' variable?
    // No, 'weekData' variable is from render scope. 
    // It's mostly fine if the user isn't clicking frantically on different days.

    // Best approach: Re-read state in setWeekData? Hard to side-effect from there.
    // We will assume 'updates' contains the fields that changed.

    // We need to save to Firestore.
    // Let's reconstruct the objects.
    const currentDay = weekData?.find(d => d.dateKey === dateKey) || allData[dateKey] || { gratuity: "", tip: "", cash: "" };
    const updatedDayData = {
      ...currentDay,
      ...updates
    };

    // Clean up purely for Firestore save if needed, but saving extra fields is fine.
    // Just ensure we save gratuity/tip/cash.
    await DataService.saveData(dateKey, {
      gratuity: updatedDayData.gratuity,
      tip: updatedDayData.tip,
      cash: updatedDayData.cash
    });
  };

  const handleChangeWeek = (direction) => {
    setBaseDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (direction * 7));
      return newDate;
    });
  };

  const handleDayClick = (day) => {
    setBaseDate(day);
    setViewMode('week');
  };

  // Seed Dummy Data for Testing (kept from feature-ui)
  useEffect(() => {
    const existing = localStorage.getItem("tip-tracker-data");
    if (!existing) {
      const dummyData = {};
      const anchor = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(anchor);
        d.setDate(d.getDate() - i);
        const k = d.toISOString().split('T')[0];
        dummyData[k] = { gratuity: (100 + i * 10), tip: (20 + i), cash: (5 + i) };
      }
      for (let i = 1; i <= 7; i++) {
        const d = new Date(anchor);
        d.setDate(d.getDate() + i);
        const k = d.toISOString().split('T')[0];
        dummyData[k] = { gratuity: 50, tip: 10, cash: 0 };
      }

      localStorage.setItem("tip-tracker-data", JSON.stringify(dummyData));
      window.location.reload();
    }
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-primary)' }}>Loading...</div>;
  }

  if (!user) {
    return <Login />;
  }

  // if (!weekData) return <div className="loading">Loading...</div>; // Optional loading state

  return (
    <main className={layout.app}>
      <div className={layout.section}><Header /></div>
      <WeekHeader
        startDate={currentWeekDates[0]}
        endDate={currentWeekDates[6]}
        onPrev={() => handleChangeWeek(-1)}
        onNext={() => handleChangeWeek(1)}
        viewMode={viewMode}
        onViewChange={setViewMode}
      />
      <div className={layout.section}>
        {viewMode === 'week' ? (
          <Calendar weekData={weekData} onUpdate={handleUpdate} />
        ) : (
          <MonthView
            currentDate={baseDate}
            allData={allData}
            onUpdate={handleUpdate}
          />
        )}

      </div>

      <div className={`${layout.section} ${layout.summaryContainer}`}>
        <BiweeklySummary
          currentWeekData={weekData}
          currentWeekStart={currentWeekDates[0]}
        />
        <Charts weekData={weekData} />
      </div>
    </main>
  );
}

export default App;
