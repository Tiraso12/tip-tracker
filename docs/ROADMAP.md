# Tip Tracker Roadmap

This file is the shared project memory for Tip Tracker improvements. It keeps version goals, decisions, and checklists outside of chat so each work session can pick up cleanly.

## Current Version

- Version name: `v1.0.0-stable`
- Branch: `main`
- Status: Released — deployed to Firebase Hosting (2026-05-16)
- Goal: Production-ready stable release. All core workflows tested, payout math trustworthy, UI polished and accessible, zero legacy CSS modules.

## Version History

| Version | Name | Status | Goal |
| --- | --- | --- | --- |
| `v0.1.0` | Foundation | Complete | Clean baseline, protected payout math, safer auth/data flow |
| `v0.2.0` | Admin Workflow | Complete | Smaller admin modules, better shift validation, safer saves |
| `v0.3.0` | Employee Dashboard | Complete | Richer employee earnings summaries and clearer weekly/pay-period totals |
| `v0.4.0` | User Management | Complete | Safer account status handling, temporary staff merge rules, better team setup |
| `v0.5.0` | Admin Daily Workflow | Complete | One-screen shift workspace, live closeout totals, and safer payout review |
| `v0.6.0` | Reports | Complete | More accurate weekly/monthly/pay-period reports and exports |
| `v0.7.0` | UI Polish | Complete | Refined minimalist light theme on Tailwind v4, reusable UI primitives |
| `v0.8.0` | Engine & Polish | Complete | Contract shift engine fixes, DnD migration, accessibility audit |
| `v1.0.0` | Stable Release | Released | Production-ready; deployed 2026-05-16 |
| `v1.1.0` | Security Hardening | Complete | Firestore rules tightened, username registration race condition fixed |

## Guiding Principles

- Protect the working app while improving it.
- Keep payout math trustworthy before changing workflows.
- Prefer small, verifiable updates over broad rewrites.
- Keep user data and employee payout records private by default.
- Document decisions that affect restaurant rules or money calculations.

## Key Decisions

**Auth & usernames:** Denied and deactivated employee accounts keep their username mapping reserved. This prevents a future account from accidentally inheriting or confusing historical payout records. Admins should reactivate the same profile if an employee returns.

**Engine warnings:** Engine warnings (e.g. "Dining Room CTP pool is negative" on pure contract shifts) are informational and do not block calculation or save. Hard input errors (missing employees, negative values, no money) still block as before.

**Bar allocations:** `barCTPAllocation` and `barGRTAllocation` are conditional on `hasBarTeam`. If bartenders work a contract shift as captains in a dining team (not in `barTeam`), allocations are skipped to avoid stranded pool money.

**UI stack:** Tailwind CSS v4 with `@tailwindcss/vite`. Design tokens in `src/styles/tailwind.css` under `@theme`. No external UI library (no shadcn/ui, no Radix). CSS Modules fully removed.

**Aesthetic:** Refined minimalist light theme. Fraunces display serif + Inter body + JetBrains Mono for money. Single accent: forest green `#1a3d2e`. 1px borders, tighter radii (4/6/8px), restrained motion (150ms hover only).

**Report permissions:** PDF exports require no additional guards beyond existing admin routing. Generation is purely client-side from already-loaded data.

## Future Ideas

- Previous-period comparisons for employee dashboard trends.
- Optional dark theme toggle.
- Detailed station logic and floor-plan functionality for the team sheet.
- Known engine limitation: `captainOverrideCTP` (1% of regular sales) is carved out even when no captains are assigned, leaving a small stranded balance. Low-priority; only affects shifts with regular sales and no captain role.
