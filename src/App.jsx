import React, { useState, useEffect } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import MonthView from "./components/Calendar/MonthView";
import Charts from "./components/Charts/Charts"; // Added Charts
import layout from "./styles/AppLayout.module.css"
import ViewSwitcher from "./components/ViewSwitcher/ViewSwitcher";
// import MonthCalendar from "./components/MonthCalendar/MonthCalendar"; // Removed
import WeekHeader from "./components/WeekHeader/WeekHeader";
import { getCurrentWeek, getCalendarMonth } from "./utils/dateUtils";

import BiweeklySummary from "./components/BiweeklySummary/BiweeklySummary";
import DataService from "./services/dataService";
import { useAuth } from "./context/AuthContext";
import Login from "./components/Auth/Login";
// import Register from "./components/Auth/Register"; // Using toggle in Login now



function App() {
  const { user, loading, logout } = useAuth();

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
      const dates = getCalendarMonth(baseDate); // Use baseDate for consistency across views if possible, or ViewSwitcher needs to manage it
      const dateKeys = dates.map(d => d.toISOString().split('T')[0]);

      DataService.getRange(dateKeys).then(dataMap => {
        setMonthData(dataMap);
      });
    }
  }, [baseDate, currentView, user]); // Removed monthDate dependency as we try to unify around baseDate

  // Handle data updates
  const handleUpdate = async (indexOrKey, fieldOrValue, valueOrNothing) => {
    console.log("App.handleUpdate called with:", indexOrKey, fieldOrValue, valueOrNothing); // DEBUG

    let dateKey, field, value;

    // Determine if first arg is index (number) or key (string)
    if (typeof indexOrKey === 'number') {
      // It's index from Week Calendar (legacy/current implementation in App)
      // BUT DayCard calls onUpdate(data.dateKey, ...)
      // So actually Week Calendar might be broken if it passes index?
      // Let's check DayCard again. DayCard calls onUpdate(data.dateKey, ...)
      // So the current App.jsx logic is definitely mismatched if it expects index.
      console.error("Should use dateKey");
    } else {
      dateKey = indexOrKey;
      field = fieldOrValue;
      value = valueOrNothing;
    }

    // 1. Optimistic UI update
    if (currentView === 'week') {
      setWeekData(prev => {
        return prev.map(day => {
          if (day.dateKey === dateKey) {
            return { ...day, [field]: value };
          }
          return day;
        });
      });
    } else {
      setMonthData(prev => ({
        ...prev,
        [dateKey]: {
          ...prev[dateKey],
          [field]: value
        }
      }));
    }

    // 2. Persist to data service
    const currentDayData = currentView === 'week'
      ? weekData?.find(d => d.dateKey === dateKey)
      : monthData[dateKey];

    const updatedDayData = {
      gratuity: currentDayData?.gratuity || "",
      tip: currentDayData?.tip || "",
      cash: currentDayData?.cash || "",
      [field]: value // Override
    };

    await DataService.saveData(dateKey, updatedDayData);
  };

  const handleChangeWeek = (direction) => {
    setBaseDate(prev => {
      const newDate = new Date(prev);
      // If in month view, maybe jump by month?
      // For now, keep WeekHeader logic for week view.
      newDate.setDate(prev.getDate() + (direction * 7));
      return newDate;
    });
  };

  // Condition to show loading only if critical data is missing matching the view
  if (!user) {
    return <Login />; // Using Login component directly
  }

  // If logged in but data is loading (weekData null check for week view)
  if (currentView === 'week' && !weekData) return null;

  return (
    <main className={layout.app}>
      <div className={layout.section}>
        <Header user={user} onLogout={logout} />
      </div>

      <div className={layout.section}>
        <WeekHeader
          startDate={currentWeekDates[0]}
          endDate={currentWeekDates[6]}
          onPrev={() => handleChangeWeek(-1)}
          onNext={() => handleChangeWeek(1)}
          viewMode={currentView}
          onViewChange={setCurrentView}
        />
      </div>

      <div className={layout.section}>
        {currentView === 'week' ? (
          <Calendar weekData={weekData} onUpdate={handleUpdate} />
        ) : (
          <MonthView
            currentDate={baseDate}
            allData={monthData}
            onUpdate={handleUpdate}
          />
        )}
      </div>

      {currentView === 'week' && (
        <div className={`${layout.section} ${layout.summaryContainer}`}>
          <BiweeklySummary
            currentWeekData={weekData}
            currentWeekStart={currentWeekDates[0]}
          />
          <Charts weekData={weekData} />
        </div>
      )}
    </main>
  );
}

export default App;
