# TipTracker

A full-stack shift and tip distribution management system built for restaurant operations. Managers configure teams, enter shift financials, and the app automatically calculates individual payouts — pooling dining-room tips house-wide by points, handling contract gratuity, captain overrides, bar allocations, and runners — with every cent accounted for.

**Live app:** https://tip-tracker-44de1.web.app

---

## The Problem It Solves

Distributing tips in a restaurant is surprisingly complex. Multiple teams with different sales, role-based point weights, contract gratuity at a fixed percentage, bar team allocations, flat-rate runners, and captain bonuses — all of it has to balance to the penny. This app replaces manual spreadsheets with an automated engine that does it instantly and generates a printable payout sheet for every shift.

---

## Features

**Shift Management**
- Drag-and-drop team builder — assign employees to teams, bar, or runners before the shift
- Per-team sales, tips, gratuity, and cash entry — dining-room tips/gratuity/cash pool together house-wide and split by points across all dining employees, not per team
- Contract shift support with automated 26% gratuity tracking
- Captain override bonus (1% of sales), split across all active captains
- Runner flat-rate payouts ($85 default) deducted from the dining room pool
- Bar-to-team transfer support for flexible nightly configurations

**Calculation Engine**
- Pure JavaScript engine with zero UI dependencies — fully unit tested
- Point-based distribution by role (Captain: 4pts, Server: 4pts, Back: 2.5pts, Assistant: 2pts)
- Pre-distribution allocations: bar (1%), door (0.5%), PE coordinator (2%), house (3%)
- Rounding reconciliation — micro-adjustments ensure totals match exactly with no floating-point drift
- Double-entry balance check on every calculation — warns if the shift doesn't balance

**Reports & Exports**
- Shift PDF report — full payout breakdown per employee (visible today, from the Shifts tab)
- Weekly, pay-period, and monthly PDF reports with daily breakdowns and employee earnings summaries — implemented, but currently disabled: the admin Reports tab is off by default (`SHOW_ADMIN_REPORTS = false` in `AdminDashboard.jsx`), so managers can't reach these yet
- Team sheet PDF — card-layout printout to post on the board before service — implemented in `pdfExport.js`, but not currently wired into any admin screen

**Admin Dashboard**
- Role-based access with admin approval flow for new users
- Team management — add/edit employees and their roles
- Calendar view — navigate and open any past shift
- Charts — visual earnings trends by employee and period
- Real-time Firestore sync — data updates instantly across sessions

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
| Charts | Recharts |

---

## Architecture

```
src/
├── components/
│   ├── Admin/
│   │   ├── ShiftEditorPanel.jsx     # Main shift workspace
│   │   ├── ShiftSetup/              # Drag-and-drop team builder
│   │   ├── DayPayoutPanel.jsx       # Payout review and save
│   │   ├── AdminReportsPanel.jsx    # Report generation UI
│   │   └── TeamManagement.jsx       # Employee roster management
│   ├── Calendar/                    # Month/week navigation
│   ├── Charts/                      # Earnings visualizations
│   └── Auth/                        # Login and approval flow
├── utils/
│   ├── engine.js                    # Core calculation engine (pure JS)
│   ├── pdfExport.js                 # All PDF generation logic
│   └── constants.js                 # Role point weights and flat rates
├── services/
│   └── dataService.js               # Firestore read/write/subscribe layer
└── context/
    └── AuthContext.jsx              # Auth state and user role management
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
npm run dev       # Start dev server
npm test          # Run engine unit tests
npm run build     # Production build
```

---

## How the Calculation Engine Works

The engine (`src/utils/engine.js`) is a pure function — it takes a normalized shift config and returns a complete payout result with no side effects.

1. **Derive totals** from per-team pool inputs (sales, tips, gratuity, cash), combined into house-wide dining-room totals
2. **Pre-distribute** — calculate bar allocation (1%), door (0.5%), captain override pool (1%), house/coordinator cuts for contract sales
3. **Adjust pools** — apply bar-to-team transfers, deduct runner payouts from dining room CTP
4. **Distribute by points** — dining-room pools are split by one house-wide point value across all dining employees (not per team); each employee's share = `(their points / total dining-room points) * adjusted pool`
5. **Captain override** — split evenly across all active captains and merged into their payout
6. **Reconcile** — correct any floating-point drift so pool totals match exactly
7. **Balance check** — verify `total available == total distributed + external allocations`

---

Built by Gonzalo Tiraso
