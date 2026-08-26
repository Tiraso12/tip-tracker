import React, { Suspense, lazy, useEffect, useState } from "react";
import Login from "./components/Auth/Login";
import PendingApproval from "./components/Auth/PendingApproval";
import PayView from "./components/Pay/PayView";
import AccountView from "./components/Account/AccountView";
import { useAuth } from "./context/AuthContext";
import { canOpenShiftWorkspace, hasOwnPayRecord } from "./utils/permissions";
import { loadPlace, savePlace } from "./utils/placeMemory";

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
  //
  // A reload restores that place instead of always resetting here: the
  // captain chose "remember on this phone," not an address-bar URL, so the
  // note lives in localStorage keyed by uid (placeMemory.js) rather than in
  // react-router. Workspace's own tab/date/step/settle-group is restored by
  // AdminDashboard itself, which is the only place that knows it - here we
  // only decide which of the three top-level surfaces to land on, and fall
  // back to today's default the moment the saved surface no longer makes
  // sense for this uid (a workspace note for someone who can no longer open
  // it, or simply nothing saved yet).
  const [surface, setSurface] = useState("pay");
  useEffect(() => {
    if (!user?.uid) return;
    const place = loadPlace(user.uid);
    if (place?.surface === "workspace" && canOpenWorkspace) {
      setSurface("workspace");
    } else if (place?.surface === "account") {
      setSurface("account");
    } else {
      setSurface("pay");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Persists "pay" and "account" here. "workspace" is intentionally left to
  // AdminDashboard's own effect, which also carries the tab/date/step/settle
  // group that belong with it - writing a bare `{surface: "workspace"}` here
  // on every render would otherwise race with and clobber that richer entry.
  useEffect(() => {
    if (!user?.uid || surface === "workspace") return;
    savePlace(user.uid, { surface });
  }, [user?.uid, surface]);

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

  if (surface === "account") {
    const homeSurface = hasPayRecord ? "pay" : "workspace";
    return (
      <AccountView
        onHome={() => setSurface(homeSurface)}
        homeLabel={hasPayRecord ? "Go to my pay" : "Go to today's shifts"}
        homeTitle={hasPayRecord ? "My pay" : "Today's shifts"}
        onOpenWorkspace={canOpenWorkspace && hasPayRecord ? () => setSurface("workspace") : undefined}
      />
    );
  }

  if (canOpenWorkspace && (surface === "workspace" || !hasPayRecord)) {
    return (
      <Suspense fallback={<InlineLoading label="Loading shift workspace..." />}>
        <AdminDashboard
          onGoToMyPay={hasPayRecord ? () => setSurface("pay") : undefined}
          onOpenAccount={() => setSurface("account")}
        />
      </Suspense>
    );
  }

  return (
    <PayView
      onOpenWorkspace={canOpenWorkspace ? () => setSurface("workspace") : undefined}
      onOpenAccount={() => setSurface("account")}
    />
  );
}

export default App;
