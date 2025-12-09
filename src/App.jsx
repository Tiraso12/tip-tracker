import React, { useState, useEffect } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import Summary from "./components/Summary/Summary";
import layout from "./styles/AppLayout.module.css"
import ViewSwitcher from "./components/ViewSwitcher/ViewSwitcher";
import MonthCalendar from "./components/MonthCalendar/MonthCalendar";
import WeekHeader from "./components/WeekHeader/WeekHeader";
import { getCurrentWeek, getCalendarMonth } from "./utils/dateUtils";

import BiweeklySummary from "./components/BiweeklySummary/BiweeklySummary";
import DataService from "./services/dataService";
import { useAuth } from "./context/AuthContext";
import Login from "./components/Auth/Login";
import Register from "./components/Auth/Register";
import AuthForm from "./components/Auth/AuthForm";


function App() {
  const { user, loading, logout } = useAuth();
  // const [authMode, setAuthMode] = useState('login'); // Removed, using Firebase UI

  const [currentView, setCurrentView] = useState('week'); // 'week' | 'month'
  const [monthDate, setMonthDate] = useState(new Date());
  const [monthData, setMonthData] = useState({});
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekData, setWeekData] = useState(null);
  const [currentWeekDates, setCurrentWeekDates] = useState([]);

  // Sync DataService user
  useEffect(() => {
    if (user) {
      DataService.setUserId(user.uid);
    } else {
      DataService.setUserId(null);
    }
  }, [user]);

  // Main Data Logic
  useEffect(() => {
    if (!user) return; // Don't fetch if not logged in

    // Week Mode Logic
    if (currentView === 'week') {
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
      // Month Mode Logic
      // For month view, we just fetch once for now (no realtime needed strictly, or we can use getRange)
      // We need 42 days for the grid
      const dates = getCalendarMonth(monthDate);
      const dateKeys = dates.map(d => d.toISOString().split('T')[0]);

      DataService.getRange(dateKeys).then(dataMap => {
        setMonthData(dataMap);
      });
    }
  }, [baseDate, currentView, monthDate, user]);

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

  const handleMonthChange = (newDate) => {
    setMonthDate(newDate);
  };

  // Condition to show loading only if critical data is missing matching the view
  if (!user) {
    return <AuthForm />;
  }

  // If logged in but data is loading (weekData null check for week view)
  if (currentView === 'week' && !weekData) return null;

  return (
    <main className={layout.app}>
      <div className={layout.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Header />
          <button
            onClick={logout}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--text-secondary)'
            }}
          >
            Logout ({user.username})
          </button>
        </div>
      </div>

      <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />

      {currentView === 'week' ? (
        <>
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
        </>
      ) : (
        <div className={layout.section}>
          <MonthCalendar
            monthDate={monthDate}
            onMonthChange={handleMonthChange}
            monthData={monthData}
          />
        </div>
      )}
    </main>
  );
}

export default App;
