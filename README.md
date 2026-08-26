# Tip Tracker

A shift and tip distribution system for one restaurant. Whoever is running the floor that night builds the lineup and enters the night's money. The engine then pays people out of two separate pools - dining and bar - by points, with contract GRT, captain override, bar allocation, Runners Fee, and runner pay all accounted for to the cent.

A payout `total` is CTP (charged tip) + GRT (gratuity). Cash is always paid and reported separately and is never folded into a total.

**Live app:** https://tip-tracker-44de1.web.app

---

## The Problem It Solves

Distributing tips by hand is slow and easy to get wrong. Multiple teams with different sales, role-based point weights, a fixed contract rate, bar allocations, flat-rate runners, and a captain override all have to balance. This app replaces the spreadsheet with an engine that does that instantly and prints a payout sheet for the night.

---

## What you see

The app has two halves. Some people hold both.

**Shifts** - pick a day, then walk **Floor plan → Settle up → Review**. A settled day is **Pay out**: who was paid, who last saved it, and the shift PDF. Dining money is entered per team because that is how a night is counted at the pass, then pooled house-wide. The bar is its own pool. The Day Rail (`src/utils/dayFlow.js`) is the authority on that spine.

**My pay** - one pay stub per person and date range: every day in the range, CTP / GRT / Total, and cash on its own line for the week it was handed over. One component serves both your own pay and a colleague's. Captains land here. The manager never does - they work no section and take no share.

**Team** - searchable roster, approvals, deactivation, temporary-profile merges, and the Supervisor switch. A job title is pay weight only. The Supervisor switch is what grants captain access; the manager pointer is what names the manager. See [Naming the manager](docs/MANAGER-CHANGEOVER.md).

Rates, point weights, and the save gate live in `src/utils/constants.js`, `src/utils/engine.js`, and `src/utils/shiftBalance.js`. Exactly one thing blocks Confirm & Save: the shift must balance to within five cents. Everything else on Review is a warning.

Weekly, pay-period and monthly PDFs, and the team sheet, still exist in `src/utils/pdfExport.js`. The Reports panel that used to reach them is gone; they are kept because the layouts are the expensive part. Re-wiring one is a button, not a rewrite.

---

## Manager Guides

- [Managing Temporary Staff Profiles](docs/MANAGING-TEMPORARY-STAFF.md) - adding staff who
  have no account yet, and when to merge them into a real account
- [Naming the manager](docs/MANAGER-CHANGEOVER.md) - the one console write that makes the
  manager and captain tiers live, and how to reverse every part of it
- [Before you deploy the Firestore rules](docs/DEPLOYING.md) - the profile name backfill that has
  to run first, and what breaks at settle up if it does not

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
│   │   ├── DayRailLanding.jsx       # Shifts tab: Floor / Settle / Review / Pay out
│   │   ├── DayRail.jsx              # Floor plan → Settle up → Review
│   │   ├── DayChipStrip.jsx         # Friday-anchored week of days
│   │   ├── ShiftEditorPanel.jsx     # Editor shell (state, autosave, Confirm & Save)
│   │   ├── ShiftEditor/             # Floor, Settle, Review steps and their cards
│   │   ├── ShiftSetup/              # Floor-plan team builder
│   │   ├── DayPayoutPanel.jsx       # Settled day's payouts, saved-by line, shift PDF
│   │   └── TeamManagement.jsx       # Team roster and person view
│   ├── Pay/                         # My pay and a colleague's statement
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

The engine (`src/utils/engine.js`) is a pure function: it takes a normalized shift config and returns a complete payout result with no side effects. Its numbered sections are the mechanics and they are the authority on the arithmetic. What follows is the restaurant policy behind them, which the code cannot show.

- **The dining room is one pool, not one per team.** Money is entered per team because that is how a night is counted at the pass, but a single house-wide point value pays every dining employee. Splitting per team would pay two servers differently for the same night's work, so this is deliberate policy and not a bug to "fix".
- **The bar is a separate pool with its own point value.** The bar allocation moves money from the dining pools to the bar pools: it never leaves the staff, so it is a subtraction on the dining ledger and an addition on the bar one, and never a deduction from the two combined. Nobody in `barTeam` means no allocation at all, because a bartender working a section as a captain must not carve out a bar pool that has no one in it.
- **Cash is never inside a total.** A payout total is charged tip plus gratuity, for every role. Cash is real money the employee is paid, but it is handed over separately and weekly, so folding it into a total would describe a payment that never happened that way.
- **Contract gratuity is the input; contract sales are inferred.** The rate is fixed by the contract (26% through 2026-08-25, 27% from 2026-08-26 on - keyed on the shift's own date, not per-contract), so the shift is entered as the gratuity that was actually charged and the engine works the sales back out of it. The number typed in is the one printed on the contract, and nobody has to re-derive it under time pressure.
- **Runner pay leaves the pool entirely**, off the top of dining charged tips, unlike the bar allocation above. On a pure contract night that can drive dining charged tips negative; that is expected and informational, not an error.
- **Rounding is reconciled against the pool, not per person.** Every payout is rounded to the cent and the last one absorbs the remainder, so the amounts on screen add up to exactly the money that existed.
- **Every shift is balanced double-entry**, and Confirm & Save will not go through until it does. Money that silently fails to balance is money someone is short at the end of the night.

---

Built by Gonzalo Tiraso
