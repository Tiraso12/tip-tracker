import React from "react";
import Header from "./components/Header/Header";
import Calendar from "./components/Calendar/Calendar";
import Summary from "./components/Summary/Summary";
import layout from "./styles/AppLayout.module.css"

import WeekHeader from "./components/WeekHeader/WeekHeader";



function App() {

   return (
 <main className={layout.app}>
      <div className={layout.section}><Header /></div>
      <WeekHeader/>
      <div className={layout.section}><Calendar /></div>
      <div className={layout.section}><Summary /></div>
    </main>
);
}

export default App;
