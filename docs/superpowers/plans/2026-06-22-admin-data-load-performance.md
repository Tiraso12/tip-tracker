# Admin Data Load Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve perceived and measured load speed for admin and employee data screens, especially on mobile, without changing payout behavior or security boundaries.

**Architecture:** Treat performance as four separable surfaces: bundle startup, admin data loading, employee tip-history loading, and admin editor render responsiveness. Keep Firestore reads explicit and small, preserve current client-side Firebase architecture, and add measurement before deeper data-model changes.

**Tech Stack:** React 19, Vite 7, Firebase Auth, Firestore, Playwright, Node test runner, ESLint.

---

## Current Evidence

- Production build main chunk is about 1,053 kB minified and 314 kB gzip.
- `src/App.jsx` eagerly imports `AdminDashboard` and `Charts`, so admin code and charting code affect initial startup.
- `src/components/Admin/AdminDashboard.jsx` fetches the full `users` collection on admin mount and the selected `shifts/{date}` document on date changes.
- `src/services/dataService.js` subscribes to all employee tip documents for the logged-in employee.
- `src/components/Admin/TeamManagement.jsx` reads all `shifts` and checks every active user's `tips` collection for merge eligibility.
- `src/components/Admin/ShiftEditorPanel.jsx` updates top-level state on every money-field keystroke and recomputes live totals.

## Guardrails

- Do not change payout math in `src/utils/engine.js` unless a task explicitly says so. This plan does not require engine changes.
- Do not change Firestore rules unless a task explicitly says so. This plan does not require rules changes.
- Do not remove any admin workflow.
- Do not start implementation until the user approves one or more tasks.
- Each agent must run the relevant focused tests plus `npm.cmd run lint` before handing back work.

## Parallelization Map

The following tracks can mostly run in parallel after the baseline measurement task:

- Track A: Bundle and route splitting.
- Track B: Admin data-load staging and caching.
- Track C: Employee tip-history query scoping.
- Track D: Team Management merge-eligibility redesign.
- Track E: Shift editor render responsiveness.

Track D depends on product approval because it changes stored metadata strategy. Tracks A, B, C, and E can be implemented without data migration if scoped carefully.

---

### Task 1: Baseline Measurement

**Purpose:** Capture before/after numbers so we can tell whether each optimization helps.

**Files:**
- Modify only if approved: `tests/e2e/admin-closeout.spec.js`
- Optional create only if approved: `tests/e2e/admin-performance.spec.js`
- Read: `playwright.config.js`
- Read: `docs/TESTING.md`

- [ ] **Step 1: Record current build output**

Run:

```powershell
npm.cmd run build
```

Expected:

```text
vite build completes, with the current main chunk size recorded in the task notes.
```

- [ ] **Step 2: Record current admin load behavior manually**

Run:

```powershell
npm.cmd run test:e2e
```

Expected:

```text
The existing admin closeout Playwright test passes.
```

- [ ] **Step 3: Add timing checkpoints only if implementation is approved**

If approved later, add Playwright timing around login, first admin heading visible, Edit Shift click, shift editor loaded, and first money input editable. Keep this in a separate performance spec so functional closeout coverage remains stable.

- [ ] **Step 4: Commit if a measurement spec is added**

Commit message:

```bash
test: add admin performance baseline coverage
```

---

### Task 2: Bundle And Route Splitting

**Purpose:** Reduce initial mobile JavaScript parse time before Firestore data even matters.

**Files:**
- Modify: `src/App.jsx`
- Possibly modify: `src/components/Admin/AdminDashboard.jsx`
- Read: `src/components/Charts/Charts.jsx`
- Read: `src/components/Admin/AdminReportsPanel.jsx`
- Read: `src/components/Admin/DayPayoutPanel.jsx`
- Read: `src/utils/pdfExport.js`

- [ ] **Step 1: Write down current eager imports**

Confirm these imports in `src/App.jsx`:

```js
import Charts from "./components/Charts/Charts";
import AdminDashboard from "./components/Admin/AdminDashboard";
```

Expected:

```text
Both components are eagerly included in the main app graph.
```

- [ ] **Step 2: Plan lazy boundaries**

Recommended lazy boundaries:

```text
AdminDashboard: load only after auth resolves an admin user.
Charts: load only on employee dashboard after basic payout data renders.
AdminReportsPanel: load only when Reports tab is selected.
ShiftEditorPanel: load only when Edit Shift is selected.
```

- [ ] **Step 3: Implement after approval**

Use `React.lazy` and `Suspense` with small loading states. Keep the visible admin shell stable while tab-specific chunks load.

- [ ] **Step 4: Verify**

Run:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run test:e2e
```

Expected:

```text
Build passes, lint passes, e2e passes, and main chunk size decreases.
```

- [ ] **Step 5: Commit**

Commit message:

```bash
perf: split admin and chart bundles
```

---

### Task 3: Admin Data-Load Staging

**Purpose:** Make the admin landing view render useful content before loading data needed only by the editor or team page.

**Files:**
- Modify: `src/components/Admin/AdminDashboard.jsx`
- Read: `src/components/Admin/ShiftEditorPanel.jsx`
- Read: `src/components/Admin/TeamManagement.jsx`
- Test: `tests/e2e/admin-closeout.spec.js`

- [ ] **Step 1: Identify initial-load reads**

Current reads:

```text
Admin mount:
- getDocs(collection(db, "users"))
- getDoc(doc(db, "shifts", selectedDate))
```

- [ ] **Step 2: Split data by need**

Recommended state:

```text
Shift summary data: load immediately for the Shifts landing panel.
Employee list: load when opening Edit Shift or Team Management.
Employee list cache: keep in AdminDashboard after first successful load.
Refresh: allow TeamManagement to request a refresh after role/status changes.
```

- [ ] **Step 3: Implement after approval**

Add a `loadEmployeesIfNeeded` helper in `AdminDashboard`. Call it before showing `ShiftEditorPanel` and before showing `TeamManagement`. Render the editor with a short employee-loading state if needed.

- [ ] **Step 4: Verify**

Run:

```powershell
npm.cmd run lint
npm.cmd run test:e2e
```

Expected:

```text
Admin closeout still passes. Edit Shift still has active non-admin employees.
```

- [ ] **Step 5: Commit**

Commit message:

```bash
perf: defer admin employee loading
```

---

### Task 4: Employee Tip-History Query Scoping

**Purpose:** Prevent employee sessions from subscribing to all historical tip records forever.

**Files:**
- Modify: `src/services/dataService.js`
- Modify: `src/App.jsx`
- Read: `src/components/EmployeePeriodSummary/EmployeePeriodSummary.jsx`
- Read: `src/components/Calendar/MonthView.jsx`
- Read: `src/components/Charts/Charts.jsx`
- Test: `src/utils/dateUtils.test.js`

- [ ] **Step 1: Confirm current subscription scope**

Current behavior:

```text
DataService.subscribeToAllData listens to every document in users/{uid}/tips.
```

- [ ] **Step 2: Choose first scoped load**

Recommended first pass:

```text
On employee login, subscribe to the visible week or month only.
When the user changes week/month, swap the subscription to that date range.
Keep already loaded ranges in memory during the session.
```

- [ ] **Step 3: Implement after approval**

Use Firestore queries against the `shiftDate` field where available, with a fallback strategy for older docs if needed. Before implementation, confirm all current saved tip records include `shiftDate`; admin save currently writes it in `ShiftEditorPanel`.

- [ ] **Step 4: Verify**

Run:

```powershell
npm.cmd test
npm.cmd run lint
```

Expected:

```text
Existing utility tests pass. Employee dashboard still renders current week data.
```

- [ ] **Step 5: Commit**

Commit message:

```bash
perf: scope employee tip subscriptions
```

---

### Task 5: Team Management Merge Eligibility Redesign

**Purpose:** Remove full-history scans from the Team tab.

**Files:**
- Modify after approval: `src/components/Admin/TeamManagement.jsx`
- Modify after approval: `src/components/Admin/ShiftEditorPanel.jsx`
- Possibly modify after approval: `src/utils/shiftPersistence.js`
- Test: `tests/e2e/admin-closeout.spec.js`
- Test: `tests/rules/firestore.rules.test.js`

- [ ] **Step 1: Confirm product rule**

Before implementation, confirm this rule with the user:

```text
A real active employee account can receive a temporary-profile merge only if it has no saved shift/tip history.
```

- [ ] **Step 2: Choose metadata strategy**

Recommended first pass:

```text
Store hasTipHistory: true on users/{uid} when a payout tip doc is saved.
Store hasShiftHistory: true on users/{uid} when the employee appears in a saved setup or closed shift.
TeamManagement uses those flags instead of scanning all shifts and all tips.
```

- [ ] **Step 3: Plan backfill**

Because existing users may not have flags, choose one:

```text
Option A: One-time admin action/backfill script.
Option B: Conservative fallback scan only for users missing flags.
Option C: Mark flags gradually on future saves only.
```

Recommended: Option B for compatibility, then add an explicit backfill later if needed.

- [ ] **Step 4: Implement after approval**

Update save flows to set flags for involved employees. Update TeamManagement to prefer flags and avoid broad collection reads when flags exist.

- [ ] **Step 5: Verify**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:rules
npm.cmd run lint
```

Expected:

```text
Closeout writes still work. Rules still allow intended admin writes. Team page no longer scans all shifts for fully flagged users.
```

- [ ] **Step 6: Commit**

Commit message:

```bash
perf: avoid full history scans for merge eligibility
```

---

### Task 6: Shift Editor Input Responsiveness

**Purpose:** Make money and point inputs feel immediate on mobile.

**Files:**
- Modify: `src/components/Admin/ShiftEditorPanel.jsx`
- Read: `src/components/Admin/ShiftSetup/ShiftSetupDnd.jsx`
- Test: `tests/e2e/admin-closeout.spec.js`

- [ ] **Step 1: Confirm current render trigger**

Current behavior:

```text
Each money input change updates teams or barTeam state.
poolSummary recomputes from teams, barTeam, and runners.
The editor component re-renders on every keystroke.
```

- [ ] **Step 2: Decide optimization style**

Recommended first pass:

```text
Keep controlled inputs, but isolate money closeout cards into memoized child components and pass stable callbacks.
Avoid re-rendering Team Floor Setup while typing money fields.
```

- [ ] **Step 3: Implement after approval**

Split closeout card components only as much as needed. Do not rewrite the editor broadly.

- [ ] **Step 4: Verify**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run lint
```

Expected:

```text
Admin closeout still passes. Typing in Sales, Tips, Gratuity, Cash, and Bar fields still updates live totals.
```

- [ ] **Step 5: Commit**

Commit message:

```bash
perf: reduce shift editor input rerenders
```

---

### Task 7: Final Review And Rollup

**Purpose:** Combine completed tracks safely and decide what to ship.

**Files:**
- Read: all changed files
- Update if approved: `docs/TESTING.md`
- Update if approved: `docs/CODE_STATE.md`

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm.cmd test
npm.cmd run test:rules
npm.cmd run test:e2e
npm.cmd run lint
npm.cmd run build
```

Expected:

```text
All tests pass. Build passes. Bundle sizes are recorded.
```

- [ ] **Step 2: Compare before/after**

Record:

```text
Main chunk before and after.
Admin heading visible timing before and after, if measured.
Edit Shift loaded timing before and after, if measured.
First money input editable timing before and after, if measured.
```

- [ ] **Step 3: Update docs if approved**

Summarize the new loading strategy in testing or code-state docs.

- [ ] **Step 4: Commit docs**

Commit message:

```bash
docs: record performance loading strategy
```

---

## Recommended Execution Order

1. Task 1: Baseline Measurement.
2. Task 2 and Task 3 in parallel.
3. Task 6 in parallel with Task 2/3 if a separate agent owns editor rendering.
4. Task 4 after Task 1, because it benefits from measurement.
5. Task 5 only after explicit product approval for metadata flags and backfill behavior.
6. Task 7 after selected tracks are complete.

## Open Product Questions

1. Should the admin landing page prioritize showing the current shift summary first, even if employee data is still loading?
2. How much historical employee data should load by default: current week, current month, current pay period, or last 90 days?
3. Is it acceptable to add user metadata flags such as `hasTipHistory` and `hasShiftHistory` to avoid expensive merge checks?
4. Should performance instrumentation remain as Playwright tests, or only as temporary local profiling notes?

## Suggested First Approval

Approve Task 1, Task 2, and Task 3 first. They are low risk, do not require a data-model migration, and directly target the likely mobile admin startup delay.

## Execution Notes

### 2026-06-22 First Batch

Approved scope:

- Task 1 baseline measurement.
- Task 2 bundle and route splitting.
- Task 3 admin data-load staging.

Completed:

- Added `src/performanceArchitecture.test.js` to guard the performance architecture.
- Verified the new test failed before implementation because `App.jsx` eagerly imported charts/admin and `AdminDashboard.jsx` fetched employees on mount.
- Lazy-loaded `AdminDashboard` and `Charts` from `src/App.jsx`.
- Skipped employee tip-history subscription for admin users.
- Lazy-loaded admin tab panels from `src/components/Admin/AdminDashboard.jsx`.
- Deferred the full `users` collection read until opening Edit Shift or Team Management.
- Added explicit employee-loading and employee-load-error states before rendering employee-dependent admin panels.

Sandbox-safe verification:

```powershell
npm.cmd test
npm.cmd run lint
```

Result:

```text
18 tests passed.
ESLint passed.
```

Sandbox-blocked verification:

```powershell
npm.cmd run build
```

Result:

```text
Blocked by sandbox access denial while Vite/esbuild loads config.
```

Not run in sandbox:

```powershell
npm.cmd run test:e2e
```

Reason:

```text
Firebase Tools reads configstore data outside the workspace sandbox.
```

Outside-sandbox verification after user approval:

```powershell
npm.cmd run build
```

Result:

```text
Build passed.
Main app chunk changed from about 1,053.21 kB minified / 314.29 kB gzip
to 579.15 kB minified / 178.46 kB gzip.
AdminDashboard, ShiftEditorPanel, TeamManagement, AdminReportsPanel, and Charts
now emit as separate lazy chunks.
```

```powershell
npm.cmd run test:e2e
```

Result:

```text
Blocked before Playwright tests ran. firebase-tools requires JDK 21 or above.
Current local Java runtime is older than Firebase Tools supports.
```

JDK 21 follow-up:

```text
Chocolatey could not install Temurin21 because this shell lacked admin access to
C:\ProgramData\chocolatey. A portable Eclipse Temurin JDK 21 was downloaded and
extracted to C:\tmp\temurin21\jdk-21.0.11+10 instead.
```

Additional local setup:

```powershell
setx JAVA_HOME "C:\tmp\temurin21\jdk-21.0.11+10"
npx.cmd playwright install chromium
```

Additional app/test config:

```text
Firestore emulator moved from port 8080 to 8081 because NVIDIA Broadcast owns
127.0.0.1:8080 on this machine.
src/config/firebase.js now reads VITE_FIRESTORE_EMULATOR_PORT and
VITE_AUTH_EMULATOR_PORT.
```

Final verification:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
$env:JAVA_HOME='C:\tmp\temurin21\jdk-21.0.11+10'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"; npm.cmd run test:e2e
```

Result:

```text
19 tests passed.
ESLint passed.
Build passed.
Playwright/Firebase E2E passed: 1 test passed.
```

### 2026-06-22 Employee Subscription Scoping

Approved scope:

- Task 4 employee tip-history query scoping.

Completed:

- Added `getEmployeeTipSubscriptionDateKeys` in `src/utils/dateUtils.js`.
- Week view now subscribes to the active biweekly pay-period keys so the weekly calendar and earnings summary both have data.
- Month view now subscribes to the visible calendar grid keys.
- Added `DataService.subscribeToDates` for document-scoped tip listeners.
- Updated `App.jsx` so employee sessions no longer call `DataService.subscribeToAllData`.
- Added tests guarding the date-window helper and the scoped subscription architecture.

Verification:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
$env:JAVA_HOME='C:\tmp\temurin21\jdk-21.0.11+10'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"; npm.cmd run test:e2e
```

Result:

```text
22 tests passed.
ESLint passed.
Build passed.
Playwright/Firebase E2E passed: 1 test passed.
```

### 2026-06-22 Merge Eligibility Flags

Approved product decision:

```text
Use hasTipHistory and hasShiftHistory when they exist. For older users missing
those flags, keep the conservative fallback scan before allowing temporary
profile merges.
```

Completed:

- Added `src/utils/userHistoryFlags.js` with merge-history state helpers.
- Team Management now uses user history flags first and only scans shifts/tips for legacy users missing flags.
- Shift setup saves mark involved real user documents with `hasShiftHistory: true`.
- Closed shift saves mark involved real user documents with `hasShiftHistory: true` and `hasTipHistory: true`.
- Temporary-profile merges mark the real target account with both history flags after transfer.
- Flag writes are limited to known real employees so temporary staff parent user docs are not created.

Verification:

```powershell
npm.cmd test
npm.cmd run lint
$env:JAVA_HOME='C:\tmp\temurin21\jdk-21.0.11+10'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"; npm.cmd run test:rules
npm.cmd run build
$env:JAVA_HOME='C:\tmp\temurin21\jdk-21.0.11+10'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"; npm.cmd run test:e2e
```

Result:

```text
26 tests passed.
ESLint passed.
Firestore rules tests passed: 6 tests.
Build passed.
Playwright/Firebase E2E passed: 1 test passed.
```
