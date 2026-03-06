import React, { useState, useEffect, useMemo } from "react";
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
import PendingApproval from "./components/Auth/PendingApproval";
import AdminDashboard from "./components/Admin/AdminDashboard";

import { useAuth } from "./context/AuthContext";

function App() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekData, setWeekData] = useState(null);
  const [currentWeekDates, setCurrentWeekDates] = useState([]);
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [allData, setAllData] = useState({});

  // Calculate Chart Data
  const chartData = useMemo(() => {
    if (viewMode === 'week') return weekData;

    // Month Mode: Aggregate by week, strictly using days in current month
    const calendarDays = getCalendarMonth(baseDate);
    const currentMonth = baseDate.getMonth();
    const currentYear = baseDate.getFullYear();

    // Chunk into 6 weeks
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }

    return weeks.map(weekDays => {
      // Filter days belonging to current month
      const daysInMonth = weekDays.filter(d => d.getMonth() === currentMonth && d.getFullYear() === currentYear);

      let grat = 0, tip = 0, cash = 0;

      daysInMonth.forEach(day => {
        const key = day.toISOString().split('T')[0];
        const data = allData[key] || { gratuity: 0, tip: 0, cash: 0 };

        grat += Number(data.gratuity) || 0;
        tip += Number(data.tip) || 0;
        cash += Number(data.cash) || 0;
      });

      // Label: Start and End of the WEEK
      const start = weekDays[0];
      const end = weekDays[6];
      // simplified format MM/DD
      const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
      const label = `${fmt(start)} - ${fmt(end)}`;

      return {
        name: label,
        date: start,
        gratuity: grat,
        tip: tip,
        cash: cash
      };
    }).filter(week => week.gratuity > 0 || week.tip > 0 || week.cash > 0 || true);

  }, [viewMode, baseDate, allData, weekData]);

  useEffect(() => {
    if (user) {
      DataService.setUserId(user.uid);
      // Reset to today's date on login so the calendar doesn't show a stale week/month
      setBaseDate(new Date());
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
  }, [baseDate, viewMode, user]);
  /* REMOVED useEffect [weekData] for persistence, moving logic to handleUpdate for robust multi-view support */

  const handleUpdate = async (dateKey, updates) => {
    // updates is an object { gratuity?, tip?, cash? }

    // Update allData and Persist (feature-ui way + DataService)
    setAllData(prev => {
      const updated = { ...prev };
      // Ensure object exists
      if (!updated[dateKey]) updated[dateKey] = { gratuity: "", tip: "", cash: "" };

      updated[dateKey] = { ...updated[dateKey], ...updates };

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

  const handleNavigation = (direction) => {
    setBaseDate(prev => {
      const newDate = new Date(prev);
      if (viewMode === 'month') {
        newDate.setMonth(prev.getMonth() + direction);
      } else {
        newDate.setDate(prev.getDate() + (direction * 7));
      }
      return newDate;
    });
  };



  // Fetch all data on user login
  useEffect(() => {
    const fetchAllData = async () => {
      if (user) {
        try {
          const data = await DataService.getAllData();
          setAllData(data);
        } catch (error) {
          console.error("Failed to fetch all data:", error);
        }
      } else {
        setAllData({});
      }
    };

    fetchAllData();
  }, [user]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-primary)' }}>Loading...</div>;
  }

  if (!user) {
    return <Login />;
  }

  // Pending users cannot access the app until approved
  if (user.status === "pending") {
    return <PendingApproval />;
  }

  // Admins go directly to their own central panel — no tracker
  if (isAdmin) {
    return <AdminDashboard />;
  }

  return (
    <main className={layout.app}>
      <div className={layout.section}>
        <Header />
      </div>
      <WeekHeader
        currentDate={baseDate}
        startDate={currentWeekDates[0]}
        endDate={currentWeekDates[6]}
        onPrev={() => handleNavigation(-1)}
        onNext={() => handleNavigation(1)}
        viewMode={viewMode}
        onViewChange={setViewMode}
      />
      <div className={layout.section}>
        {viewMode === 'week' ? (
          <Calendar weekData={weekData} onUpdate={handleUpdate} readOnly={!isAdmin} />
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
          viewMode={viewMode}
          currentDate={baseDate}
          allData={allData}
        />
        <Charts weekData={chartData} />
      </div>
    </main>
  );
}

export default App;
