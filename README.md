# Tip Tracker

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
- Shift PDF report - full payout breakdown per employee, from the day's payout panel
- Weekly, pay-period and monthly PDF reports, and the team sheet card printout - implemented in `pdfExport.js` but not wired into any screen; the admin Reports panel that used to reach them has been removed

**Pay statement**
- One pay stub per person and date range - every day in the range, CTP/GRT/Total, and cash on its own line for the week it was handed over
- One component serves both your own pay and a colleague's, so the two cannot drift apart

**Admin Dashboard**
- Tiered access - manager, captain (the per-person Supervisor switch), employee - with an approval flow for new sign-ups
- Team roster - searchable, with job titles, approvals, deactivation, temporary-profile merges, and the Supervisor switch
- Day Rail - pick any day and step through Floor plan → Settle up → Review
- Real-time Firestore sync — data updates instantly across sessions

---

## Manager Guides

- [Managing Temporary Staff Profiles](docs/MANAGING-TEMPORARY-STAFF.md) - adding staff who
  have no account yet, and when to merge them into a real account

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
│   │   ├── DayPayoutPanel.jsx       # Payout review, save, and shift PDF
│   │   └── TeamManagement.jsx       # Team roster and person view
│   ├── Pay/                         # Pay statement (own pay and colleague pay)
│   ├── Account/                     # Identity, account sheet, self-service
│   ├── AppBar/                      # Shared bar for both halves of the app
│   └── Auth/                        # Login and approval flow
├── utils/
│   ├── engine.js                    # Core calculation engine (pure JS)
│   ├── permissions.js               # Every capability, named once
│   ├── payoutLedger.js              # Payout totals and reconciliation
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
npm run dev       # Start dev server against the configured Firebase project
npm test          # Run unit tests
npm run build     # Production build
```

Day-to-day development and the full test gate are emulator-first and need no Firebase project of
your own. [docs/TESTING.md](docs/TESTING.md) is the authoritative setup: `npm run dev:local` for the
loop and `npm run test:all` before pushing.

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
