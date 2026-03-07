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

      // Compute static weekData from allData
      const computedWeekData = dates.map(date => {
        const key = date.toISOString().split('T')[0];
        return {
          date: date,
          dateKey: key,
          gratuity: allData?.[key]?.gratuity || "",
          tip: allData?.[key]?.tip || "",
          cash: allData?.[key]?.cash || ""
        };
      });
      setWeekData(computedWeekData);
    } else {
      // Month mode handled by component naturally
    }
  }, [baseDate, viewMode, allData]);


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

  // Unverified or pending users cannot access the app until verified and approved
  if (user.status === "pending" || !user.emailVerified) {
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
          <Calendar weekData={weekData} />
        ) : (
          <MonthView
            currentDate={baseDate}
            allData={allData}
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
