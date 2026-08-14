# Tip Tracker

A full-stack shift and tip distribution management system built for restaurant operations. Whoever is running the floor that night builds the teams and enters the shift's money, and the app calculates individual payouts — pooling dining-room tips house-wide by points, handling contract gratuity, captain overrides, bar allocations, and runners — with every cent accounted for.

**Live app:** https://tip-tracker-44de1.web.app

---

## The Problem It Solves

Distributing tips in a restaurant is surprisingly complex. Multiple teams with different sales, role-based point weights, contract gratuity at a fixed percentage, bar team allocations, flat-rate runners, and captain bonuses — all of it has to balance to the penny. This app replaces manual spreadsheets with an automated engine that does it instantly and generates a printable payout sheet for every shift.

---

## Features

**Shift Management**
- Team builder - drag and drop on a desktop, tap-to-assign on a phone - putting employees on teams, the bar, or runners before the shift
- Per-team sales, tips, gratuity, and cash entry — dining-room tips/gratuity/cash pool together house-wide and split by points across all dining employees, not per team
- Contract shift support - the gratuity is what gets entered, and contract sales are derived from it at the fixed 26%
- Captain override bonus - 1% of regular sales on the charged-tip side, 1% of contract sales on the gratuity side, split evenly across the captains on the floor; on a night nobody works as Captain it is not taken at all and the money stays in the pool the team splits
- Runner flat-rate payouts ($85 default) deducted from the dining room pool
- Bar-to-team transfer support for flexible nightly configurations

**Calculation Engine**
- Pure JavaScript engine with zero UI dependencies — fully unit tested
- Point-based distribution by role (Captain: 4pts, Server: 4pts, Back: 2.5pts, Assistant: 2pts)
- Pre-distribution allocations, at their own rate on each side of the money: off charged tips, bar 1% and door 0.5% of regular sales; off gratuity, bar 1%, door 2%, PE coordinator 2% and house 3% of contract sales
- Rounding reconciliation — micro-adjustments ensure totals match exactly with no floating-point drift
- Double-entry balance check on every calculation — warns if the shift doesn't balance

**Reports & Exports**
- Shift PDF report - full payout breakdown per employee, from the day's payout panel
- Weekly, pay-period and monthly PDF reports, and the team sheet card printout - implemented in `pdfExport.js` but not wired into any screen; the admin Reports panel that used to reach them has been removed

**Pay statement**
- One pay stub per person and date range - every day in the range, CTP/GRT/Total, and cash on its own line for the week it was handed over
- One component serves both your own pay and a colleague's, so the two cannot drift apart

**Admin Dashboard**
- Tiered access - manager, captain (the per-person Supervisor switch), employee - with an approval flow for new sign-ups
- Team roster - searchable, with job titles, approvals, deactivation, temporary-profile merges, and the Supervisor switch
- Day Rail - pick any day and step through Floor plan → Settle up → Review
- A settled day names who last saved it and when, so a correction is never anonymous
- Live where it has to be - the app bar's pending-approvals count and a person's pay statement
  subscribe to Firestore; the day's workspace loads on request and refetches after a save, so a
  night costs a bounded read rather than a standing listener on the whole roster

---

## Manager Guides

- [Managing Temporary Staff Profiles](docs/MANAGING-TEMPORARY-STAFF.md) - adding staff who
  have no account yet, and when to merge them into a real account
- [Naming the manager](docs/MANAGER-CHANGEOVER.md) - the one console write that makes the
  manager and captain tiers live, and how to reverse every part of it

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7 |
| Styling | Tailwind CSS v4 |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Hosting | Firebase Hosting |
| PDF Generation | jsPDF + jsPDF-AutoTable |

---

## Architecture

```
src/
├── components/
│   ├── Admin/
│   │   ├── AdminDashboard.jsx       # Shift workspace shell and day loading
│   │   ├── DayRail.jsx              # Floor plan → Settle up → Review
│   │   ├── ShiftEditorPanel.jsx     # Main shift workspace
│   │   ├── ShiftSetup/              # Drag-and-drop team builder
│   │   ├── DayPayoutPanel.jsx       # Settled day's payouts, saved-by line, shift PDF
│   │   └── TeamManagement.jsx       # Team roster and person view
│   ├── Pay/                         # Pay statement (own pay and colleague pay)
│   ├── Account/                     # Identity, account sheet, self-service
│   ├── AppBar/                      # Shared bar for both halves of the app
│   └── Auth/                        # Login and approval flow
├── utils/
│   ├── engine.js                    # Core calculation engine (pure JS)
│   ├── permissions.js               # Every capability, named once
│   ├── payoutLedger.js              # Payout totals and reconciliation
│   ├── dayFlow.js                   # Which stage a date is at on the rail
│   ├── pdfExport.js                 # All PDF generation logic
│   └── constants.js                 # Role point weights and flat rates
├── services/
│   └── dataService.js               # Firestore read/write/subscribe layer
└── context/
    └── AuthContext.jsx              # Auth state, the profile, and the manager pointer
```

---

## Local Setup

**Prerequisites:** Node.js 20+, a Firebase project with Firestore and Authentication enabled.

```bash
git clone https://github.com/Tiraso12/tip-tracker.git
cd tip-tracker
npm install
```

Create a `.env.local` file with your Firebase config:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

```bash
npm run dev       # Start dev server against the configured Firebase project
npm test          # Run unit tests
npm run build     # Production build
```

Day-to-day development and the full test gate are emulator-first and need no Firebase project of
your own. [docs/TESTING.md](docs/TESTING.md) is the authoritative setup: `npm run dev:local` for the
loop and `npm run test:all` before pushing.

---

## Why the Calculation Engine Is Shaped This Way

The engine (`src/utils/engine.js`) is a pure function — it takes a normalized shift config and returns a complete payout result with no side effects. Its numbered sections are the mechanics and they are the authority on the arithmetic. What follows is the restaurant policy behind them, which the code cannot show.

- **The dining room is one pool, not one per team.** Money is entered per team because that is how a night is counted at the pass, but a single house-wide point value pays every dining employee. Splitting per team would pay two servers differently for the same night's work, so this is deliberate policy and not a bug to "fix".
- **The bar is a separate pool with its own point value.** The bar allocation moves money from the dining pools to the bar pools: it never leaves the staff, so it is a subtraction on the dining ledger and an addition on the bar one, and never a deduction from the two combined. Nobody in `barTeam` means no allocation at all, because a bartender working a section as a captain must not carve out a bar pool that has no one in it.
- **Cash is never inside a total.** A payout total is charged tip plus gratuity, for every role. Cash is real money the employee is paid, but it is handed over separately and weekly, so folding it into a total would describe a payment that never happened that way.
- **Contract gratuity is the input; contract sales are inferred.** The 26% is fixed by the contract, so the shift is entered as the gratuity that was actually charged and the engine works the sales back out of it. The number typed in is the one printed on the contract, and nobody has to re-derive it under time pressure.
- **Runner pay leaves the pool entirely**, off the top of dining charged tips, unlike the bar allocation above. On a pure contract night that can drive dining charged tips negative; that is expected and informational, not an error.
- **Rounding is reconciled against the pool, not per person.** Every payout is rounded to the cent and the last one absorbs the remainder, so the amounts on screen add up to exactly the money that existed.
- **Every shift is balanced double-entry** and says so when it does not. Money that silently fails to balance is money someone is short at the end of the night.

---

Built by Gonzalo Tiraso
