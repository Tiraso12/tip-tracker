import React, { Suspense, lazy, useState, useEffect, useMemo } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import MonthView from "./components/Calendar/MonthView";

import WeekHeader from "./components/WeekHeader/WeekHeader";
import { getCurrentWeek, getCalendarMonth, getEmployeeTipSubscriptionDateKeys, toDateKey } from "./utils/dateUtils";

import EmployeePeriodSummary from "./components/EmployeePeriodSummary/EmployeePeriodSummary";
import DataService from "./services/dataService";
import Login from "./components/Auth/Login";
import PendingApproval from "./components/Auth/PendingApproval";

import { useAuth } from "./context/AuthContext";

const AdminDashboard = lazy(() => import("./components/Admin/AdminDashboard"));
const Charts = lazy(() => import("./components/Charts/Charts"));

function InlineLoading({ label = "Loading..." }) {
  return (
    <div className="py-6 text-center text-sm text-[var(--color-ink-soft)]">
      {label}
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin" && user?.status === "active";
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekData, setWeekData] = useState(null);
  const [currentWeekDates, setCurrentWeekDates] = useState([]);
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [allData, setAllData] = useState({});
  const tipSubscriptionDateKeys = useMemo(
    () => getEmployeeTipSubscriptionDateKeys(baseDate, viewMode),
    [baseDate, viewMode]
  );

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
        const key = toDateKey(day);
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
        const key = toDateKey(date);
        return {
          date: date,
          dateKey: key,
          gratuity: allData?.[key]?.gratuity || "",
          tip: allData?.[key]?.tip || "",
          cash: allData?.[key]?.cash || "",
          role: allData?.[key]?.role || "",
          points: allData?.[key]?.points || ""
        };
      });
      setWeekData(computedWeekData);
    } else {
      // Month mode handled by component naturally
    }
  }, [baseDate, viewMode, allData]);


  const handleNavigation = (direction) => {
    setBaseDate(prev => {
      if (viewMode === 'month') {
        const newDate = new Date(prev);
        newDate.setMonth(prev.getMonth() + direction);
        return newDate;
      }

      if (currentWeekDates[0]) {
        const newDate = new Date(currentWeekDates[0]);
        newDate.setDate(currentWeekDates[0].getDate() + (direction * 7));
        return newDate;
      } else {
        const newDate = new Date(prev);
        newDate.setDate(prev.getDate() + (direction * 7));
        return newDate;
      }
    });
  };



  // Keep user tip history fresh after login.
  useEffect(() => {
    if (!user || user.role === "admin") {
      setAllData({});
      return undefined;
    }

    return DataService.subscribeToDates(
      tipSubscriptionDateKeys,
      (dateKey, data) => {
        setAllData(prev => ({ ...prev, [dateKey]: data }));
      },
      () => setAllData({})
    );
  }, [user, tipSubscriptionDateKeys]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-[var(--color-ink-soft)]">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Admins need an active profile before they can access manager workflows.
  if (isAdmin) {
    return (
      <Suspense fallback={<InlineLoading label="Loading admin workspace..." />}>
        <AdminDashboard />
      </Suspense>
    );
  }

  // Employees need an active profile before they can access the dashboard.
  if (user.status !== "active") {
    return <PendingApproval />;
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-8">
        <Header />
        <WeekHeader
          currentDate={baseDate}
          startDate={currentWeekDates[0]}
          endDate={currentWeekDates[6]}
          onPrev={() => handleNavigation(-1)}
          onNext={() => handleNavigation(1)}
          viewMode={viewMode}
          onViewChange={setViewMode}
          onDateChange={setBaseDate}
        />
        <EmployeePeriodSummary
          currentDate={baseDate}
          currentWeekStart={currentWeekDates[0]}
          currentWeekEnd={currentWeekDates[6]}
          allData={allData}
        />
        {viewMode === 'week' ? (
          <Calendar weekData={weekData} />
        ) : (
          <MonthView currentDate={baseDate} allData={allData} />
        )}
        <Suspense fallback={<InlineLoading label="Loading charts..." />}>
          <Charts weekData={chartData} />
        </Suspense>
      </div>
    </main>
  );
}

export default App;
