import React, { Suspense, lazy, useEffect, useState } from "react";
import Login from "./components/Auth/Login";
import PendingApproval from "./components/Auth/PendingApproval";
import PayView from "./components/Pay/PayView";
import { useAuth } from "./context/AuthContext";
import { canOpenShiftWorkspace, hasOwnPayRecord } from "./utils/permissions";

const AdminDashboard = lazy(() => import("./components/Admin/AdminDashboard"));

function InlineLoading({ label = "Loading..." }) {
  return (
    <div className="py-6 text-center text-sm text-[var(--color-ink-soft)]">
      {label}
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();

  // The two halves of the app are no longer two disjoint audiences. A captain
  // is a supervisor AND a paid member of the tip pool, so they hold both: the
  // workspace because they run the night, their own pay because the pool pays
  // them. The gate below decides whether the workspace is AVAILABLE, not which
  // half of the app someone gets.
  const canOpenWorkspace = canOpenShiftWorkspace(user);
  // ...and this decides whether there is a pay statement to show at all. The
  // manager has no pay record by design - they work no section and take no
  // share - so they get the workspace and nothing else. Everyone else has one.
  const hasPayRecord = hasOwnPayRecord(user);

  // Which half is on screen for someone who holds both. A captain LANDS on
  // their own pay: that is the shape the captain chose, knowing it costs a tap
  // to reach tonight's shift, because the pool pays them and their week is
  // theirs to check. The account sheet is how they cross, in either direction.
  const [surface, setSurface] = useState("pay");
  useEffect(() => {
    setSurface("pay");
  }, [user?.uid]);

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

  // Nobody reaches either half without an active profile.
  if (user.status !== "active") {
    return <PendingApproval />;
  }

  if (canOpenWorkspace && (surface === "workspace" || !hasPayRecord)) {
    return (
      <Suspense fallback={<InlineLoading label="Loading shift workspace..." />}>
        <AdminDashboard onGoToMyPay={hasPayRecord ? () => setSurface("pay") : undefined} />
      </Suspense>
    );
  }

  return <PayView onOpenWorkspace={canOpenWorkspace ? () => setSurface("workspace") : undefined} />;
}

export default App;
