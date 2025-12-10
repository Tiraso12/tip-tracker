import React, { useState } from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import MonthView from "./components/Calendar/MonthView";
import Charts from "./components/Charts/Charts";
import layout from "./styles/AppLayout.module.css"
import WeekHeader from "./components/WeekHeader/WeekHeader";
import BiweeklySummary from "./components/BiweeklySummary/BiweeklySummary";
import Login from "./components/Auth/Login";
import { useAuth } from "./hooks/useAuth";
import { useTipData } from "./hooks/useTipData";

function App() {
  const { isAuthenticated, login } = useAuth();
  const [baseDate, setBaseDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'

  const { weekData, allData, currentWeekDates, handleUpdate } = useTipData(baseDate);

  const handleChangeWeek = (direction) => {
    setBaseDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (direction * 7));
      return newDate;
    });
  };

  if (!isAuthenticated) {
    return <Login onLogin={login} />;
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
