import React, { useState, useEffect } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import MonthView from "./components/Calendar/MonthView";
import Charts from "./components/Charts/Charts";
import layout from "./styles/AppLayout.module.css"
import WeekHeader from "./components/WeekHeader/WeekHeader";
import { getCurrentWeek } from "./utils/dateUtils";
import BiweeklySummary from "./components/BiweeklySummary/BiweeklySummary";
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
    // Initialize the week based on baseDate
    const dates = getCurrentWeek(baseDate);
    setCurrentWeekDates(dates);

    // Load saved data
    const savedJSON = localStorage.getItem("tip-tracker-data");
    const savedData = savedJSON ? JSON.parse(savedJSON) : {};
    setAllData(savedData);

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

  /* REMOVED useEffect [weekData] for persistence, moving logic to handleUpdate for robust multi-view support */

  const handleUpdate = (dateKey, field, value) => {
    // Update allData and Persist
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
      window.location.reload();
    }
  }, []);

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  if (!weekData) return null; // or loading spinner

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
