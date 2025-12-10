import React, { useState, useEffect } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import MonthView from "./components/Calendar/MonthView";
import Charts from "./components/Charts/Charts";
import layout from "./styles/AppLayout.module.css"
import ViewSwitcher from "./components/ViewSwitcher/ViewSwitcher";
import MonthCalendar from "./components/MonthCalendar/MonthCalendar";
import WeekHeader from "./components/WeekHeader/WeekHeader";
import { getCurrentWeek, getCalendarMonth } from "./utils/dateUtils";

import BiweeklySummary from "./components/BiweeklySummary/BiweeklySummary";
import DataService from "./services/dataService";
import Login from "./components/Auth/Login";


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekData, setWeekData] = useState(null);
  const [currentWeekDates, setCurrentWeekDates] = useState([]);
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [allData, setAllData] = useState({});

  useEffect(() => {
    // Check if user was previously authenticated (simulated)
    const storedAuth = localStorage.getItem("tip-tracker-auth");
    if (storedAuth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

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
      // We'll stick to 'viewMode' state but this block uses 'currentView'. 
      // Note: I replaced conflict 1 state to use isAuthenticated. 
      // I need to ensure viewMode vs currentView is consistent. 
      // feature-ui uses 'viewMode'. HEAD used 'currentView'. 
      // I should have replaced currentView usage in lines 45 too?
      // Wait, line 45: if (currentView === 'week') {
      // I need to fix that if I removed currentView state.
    }
  }, [baseDate, viewMode]);
  /* REMOVED useEffect [weekData] for persistence, moving logic to handleUpdate for robust multi-view support */

  const handleUpdate = async (dateKey, field, value) => {
    // Update allData and Persist (feature-ui way + DataService)
    setAllData(prev => {
      const updated = { ...prev };
      // Ensure object exists
      if (!updated[dateKey]) updated[dateKey] = { gratuity: "", tip: "", cash: "" };

      updated[dateKey] = { ...updated[dateKey], [field]: value };

      localStorage.setItem("tip-tracker-data", JSON.stringify(updated));
      return updated;
    });

    // Update weekData so currently visible WeekView updates instantly
    setWeekData(prev => {
      if (!prev) return prev;
      return prev.map(day => {
        if (day.dateKey === dateKey) {
          return { ...day, [field]: value };
        }
        return day;
      });
    });

    // 2. Persist to data service
    const dayToUpdate = weekData?.find(d => d.dateKey === dateKey);
    if (dayToUpdate) {
      const updatedDayData = {
        gratuity: field === 'gratuity' ? value : dayToUpdate.gratuity,
        tip: field === 'tip' ? value : dayToUpdate.tip,
        cash: field === 'cash' ? value : dayToUpdate.cash
      };
      if (field === 'gratuity' || field === 'tip' || field === 'cash') {
        await DataService.saveData(dateKey, updatedDayData);
      }
    }
  };

  const handleChangeWeek = (direction) => {
    setBaseDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (direction * 7));
      return newDate;
    });
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem("tip-tracker-auth", "true");
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

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
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
