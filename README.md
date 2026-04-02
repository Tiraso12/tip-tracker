# Tip Tracker (Professional)

A sophisticated, enterprise-grade **Shift & Payout Management System** designed for high-volume hospitality venues. This application streamlines complex tip-out distributions, multi-team allocations, and financial auditing with a high-performance calculation engine.

## Core Features

### 🚀 Advanced Calculation Engine (`engine.js`)
- **Automated Payouts**: Real-time distribution based on weighted role points.
- **Role-Based Logic**: Specialized handling for Captains, Servers, Backs, Assistants, Bartenders, and Runners.
- **Dynamic Balancing**: Built-in "Double-Entry" audit logic to ensure every cent is accounted for across all pools.

### 👥 Team & Pool Management
- **Multi-Team Support**: Distribution across multiple teams.
- **Integrated Bar Pools**: Automated sales-based allocations.
- **Manual Runner Overrides**: Flexible payout controls for support staff.

### ⚖️ Professional Allocations & Deductions
- **Contract Sales Logic**: Automated gratuity calculation and tracking.
- **Systematic Cuts**: Pre-distribution "skims" for:
  - CTP and GRT allocations.
  - Performance-based incentives.
  - Venue-specific administrative deductions.
- **Logical Splits**: Logical tip distribution based on individual or team sales performance.

### 📊 Financial Contexts & Reporting
- **PDF Exporting**: Generate professional shift summaries and payout reports using `jsPDF`.
- **Biweekly Summaries**: Long-term financial tracking and pay-period analytics.
- **Calendar Visualization**: Week and month views for historical shift data access.

## Tech Stack

- **Frontend**: React 19 + Vite 7 (Latest)
- **Database**: Firebase Firestore (Real-time sync)
- **Auth**: Firebase Auth (User-specific data isolation)
- **Reporting**: [jsPDF](https://github.com/parallax/jsPDF) & [jsPDF-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable)
- **Analytics**: Recharts 3.5

## Getting Started

### Prerequisites
- Node.js (v18+)
- Firebase Account & Project

### Installation
1. Clone & `npm install`.
2. Configure `.env.local` with Firebase credentials.
3. Run `npm run dev`.

## Project Architecture

```
tip-tracker/
├── src/
│   ├── components/
│   │   ├── Admin/          # Shift configuration & pool management
│   │   ├── BiweeklySummary/ # Pay period financial tracking
│   │   └── Calendar/       # Historical shift navigation
│   ├── utils/
│   │   ├── engine.js       # The "Brain": Core payout logic
│   │   └── constants.js    # Role weights & allocation rules
│   └── services/           # Firestore data synchronization layer
├── firestore.rules         # Enterprise-grade security protocols
└── package.json
```

## Security & Reliability
- **Data Isolation**: User-specific Firestore rules ensure privacy between venues/managers.
- **Audit Logs**: The calculation engine generates detailed validation warnings for unbalanced shifts.
- **Rounding Reconciliation**: Micro-adjustment logic ensures mathematical precision in decimal-based tip payouts.

---
Built with ❤️ for professional service teams.
